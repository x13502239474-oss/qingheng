/** 极简事件总线：视图数据变更后通知主框架重绘当前页面 */
const listeners = new Set();

export const bus = {
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(type = 'change') {
    for (const fn of listeners) fn(type);
  },
};
