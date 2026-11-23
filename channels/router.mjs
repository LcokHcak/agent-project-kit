// Channel bindings and enabled driver instances are supplied by the trusted service.
const kinds = new Set(['assigned', 'updated', 'decision-needed', 'completed']);
const actions = new Set(['open', 'acknowledge', 'request-changes', 'approve']);
function identifier(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw Error('缺少有效标识');
  return value;
}

export function createRouter({ drivers, enabled, bindings }) {
  const active = new Map(enabled.map(name => {
    const driver = Object.hasOwn(drivers, name) ? drivers[name] : undefined;
    if (typeof driver?.send !== 'function' || typeof driver?.verifyAndDecode !== 'function') throw Error('渠道缺少驱动 ' + name);
    return [name,driver];
  }));
  const routes = bindings.map(binding => ({ ...binding }));
  for (const route of routes) {
    for (const key of ['channel','projectId','memberId','tenantId','conversationId','externalUserId']) identifier(route[key]);
  }
  function unique(matches) {
    if (matches.length !== 1) throw Error('渠道绑定缺失或不唯一');
    return matches[0];
  }
  return {
    async notify(channel, event) {
      const driver = active.get(channel);
      if (!driver || !kinds.has(event.kind)) throw Error('渠道未启用或事件不支持');
      const route = unique(routes.filter(r => r.channel === channel && r.projectId === event.projectId && r.memberId === event.recipient));
      const target = {tenantId:route.tenantId,conversationId:route.conversationId,externalUserId:route.externalUserId};
      // Pass only task references. The service checks access again when the recipient opens the task.
      return driver.send(target, {eventId:identifier(event.eventId),projectId:route.projectId,taskId:identifier(event.taskId),kind:event.kind});
    },
    async receive(channel, request) {
      const driver = active.get(channel);
      if (!driver) throw Error('渠道未启用');
      const input = await driver.verifyAndDecode(request);
      if (!input || !actions.has(input.action)) throw Error('回调无效');
      const route = unique(routes.filter(r => r.channel === channel && r.tenantId === input.tenantId &&
        r.conversationId === input.conversationId && r.externalUserId === input.externalUserId && r.projectId === input.projectId));
      // A verified callback is an intent. The host still checks the current task and the actor's permissions.
      return {channel,tenantId:route.tenantId,eventId:identifier(input.eventId),projectId:route.projectId,
        memberId:route.memberId,taskId:identifier(input.taskId),action:input.action};
    },
  };
}
