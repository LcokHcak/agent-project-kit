import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRouter } from '../channels/router.mjs';

test('按项目启用不同渠道，同一任务编号双向传递且只发送任务引用', async () => {
  const sent = [];
  const local = {send:(target,event) => sent.push({target,event}),verifyAndDecode:request => request.verified ? request : null};
  const binding = {channel:'chat-demo',tenantId:'co',conversationId:'room',externalUserId:'7',projectId:'a',memberId:'m'};
  const router = createRouter({drivers:{'chat-demo':local,'other-demo':local}, enabled:['chat-demo'],bindings:[binding]});
  const event = {eventId:'e',projectId:'a',taskId:'T-1',kind:'assigned',recipient:'m',privateNote:'local only'};
  await router.notify('chat-demo',event);
  assert.deepEqual(sent[0].event,{eventId:'e',projectId:'a',taskId:'T-1',kind:'assigned'});
  await assert.rejects(router.notify('other-demo',event));
  await assert.rejects(router.notify('chat-demo',{...event,projectId:'b'}));
  const callback = {...binding,verified:true,eventId:'ack-1',taskId:'T-1',action:'acknowledge',memberId:'spoofed'};
  const intent = await router.receive('chat-demo',callback);
  assert.equal(intent.memberId,'m'); assert.equal(intent.taskId,'T-1');
  await assert.rejects(router.receive('chat-demo',{...callback,verified:false}));
  await assert.rejects(router.receive('chat-demo',{...callback,tenantId:'different'}));
  await assert.rejects(router.receive('chat-demo',{...callback,projectId:'b'}));
});
