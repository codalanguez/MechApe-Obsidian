import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ReplyStream, desktopStreamTransport } from '../src/streaming';
import { parseResponse, send } from '../src/providers';
import { runAgent } from '../src/agent';
import { DEFAULTS } from '../src/config';
import type { VaultTools } from '../src/vault-tools';

const event = (data: unknown) => `data: ${JSON.stringify(data)}\r\n\r\n`;
test('compatible streaming emits text early and collects split tool arguments', () => {
  const seen: string[] = []; const stream = new ReplyStream('openrouter', text => seen.push(text));
  const first = event({ choices: [{ delta: { content: 'Hello ', tool_calls: [{ index: 0, id:'call1', function:{name:'read_note',arguments:'{"path":'} }] } }] });
  for (const char of first) stream.push(char);
  assert.deepEqual(seen,['Hello ']);
  stream.push(event({ choices:[{ delta:{ content:'world',tool_calls:[{index:0,function:{arguments:'"Book/A.md"}'}}]},finish_reason:'tool_calls'}] }));
  stream.push('data: [DONE]\n\n');
  const result = parseResponse('openrouter', stream.finish());
  assert.equal(result.content,'Hello world'); assert.deepEqual(result.calls?.[0].arguments,{path:'Book/A.md'});
});
test('Anthropic streams text and defers tool arguments until message_stop', () => {
  const stream = new ReplyStream('anthropic', () => {});
  for (const data of [
    {type:'content_block_start',index:0,content_block:{type:'text',text:''}},
    {type:'content_block_delta',index:0,delta:{type:'text_delta',text:'Checking notes'}},
    {type:'content_block_start',index:1,content_block:{type:'tool_use',id:'a',name:'read_note',input:{}}},
    {type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'{"path":"Book/A.md"}'}},
    {type:'message_delta',delta:{stop_reason:'tool_use'}}, {type:'message_stop'}
  ]) stream.push(event(data));
  const result = parseResponse('anthropic',stream.finish());
  assert.equal(result.content,'Checking notes'); assert.equal(result.calls?.[0].name,'read_note');
});
test('Ollama NDJSON handles split chunks and validates final tool arguments', () => {
  const stream = new ReplyStream('ollama', () => {});
  for (const char of JSON.stringify({message:{role:'assistant',content:'Local reply'}})+'\n'+JSON.stringify({message:{role:'assistant',content:''},done:true,done_reason:'stop'})) stream.push(char);
  assert.equal(parseResponse('ollama',stream.finish()).content,'Local reply');
});
test('truncated streams and output limits never produce executable tools', () => {
  const truncated = new ReplyStream('compatible',()=>{});
  truncated.push(event({choices:[{delta:{tool_calls:[{index:0,id:'a',function:{name:'create_note',arguments:'{'}}]}}]}));
  assert.throws(()=>truncated.finish(), /ended early/);
  const limited = new ReplyStream('compatible',()=>{});
  limited.push(event({choices:[{delta:{content:'partial'},finish_reason:'length'}]})+'data: [DONE]\n\n');
  assert.throws(()=>limited.finish(), /output limit/);
});
test('desktop Stop aborts an active response and suppresses subsequent chunks', async () => {
  let connectionClosed = false, received = '';
  const server = createServer((req,res)=>{
    res.writeHead(200, {'Content-Type':'text/event-stream'});
    res.write(event({choices:[{delta:{content:'First'}}]}));
    const timer = setInterval(()=>res.write(event({choices:[{delta:{content:' late'}}]})),20);
    res.on('close',()=>{connectionClosed=true;clearInterval(timer);});
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const port = (server.address() as {port:number}).port;
    const controller = new AbortController();
    const result = send(desktopStreamTransport('compatible',text=>{received=text;controller.abort();}),
      {url:`http://127.0.0.1:${port}`,method:'POST',headers:{},body:'{}'},controller.signal);
    await assert.rejects(result,/Stopped|abort/i);
    await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(received,'First'); assert.equal(connectionClosed,true);
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
});

test('cancelling a streamed tool reply prevents all vault actions', async () => {
  const settings = structuredClone(DEFAULTS); settings.connections.ollama.model = 'test';
  const controller = new AbortController(); let executed = 0;
  const tools = {definitions:()=>[{name:'read_note',description:'Read',parameters:{}}],execute:async()=>{executed++;return '{}';}} as unknown as VaultTools;
  await assert.rejects(runAgent({ settings, skill:settings.skills[0], messages:[{role:'user',content:'Read a note'}], tools,
    signal:controller.signal, transport:async()=>{throw Error('Buffered request should not run');}, onText:async()=>{},onActivity:()=>{},onDelta:()=>{},
    streamTransport:async request=>{
      assert.equal(JSON.parse(request.body!).stream,true); controller.abort();
      return {status:200,json:{message:{role:'assistant',content:'',tool_calls:[{function:{name:'read_note',arguments:{path:'A.md'}}}]},done:true}};
    }
  }));
  assert.equal(executed,0);
});
