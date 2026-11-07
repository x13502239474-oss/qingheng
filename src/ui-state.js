/** 跨页面共享的 UI 状态（不持久化，只影响当前会话的交互） */
import { todayKey, nowTime } from './utils.js';

export function guessCategory() {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

export const ui = {
  dietDate: todayKey(),
  dietCategory: guessCategory(),
  dietTime: nowTime(),
  // 表单草稿：切换日期 / 餐次导致重绘时保留已输入内容
  mealDraft: { name: '', calories: '', note: '' },
  editMealId: null,
  editWeightId: null,
  weightFormDate: todayKey(),
  weightRange: 30,
  calorieRange: 7,
  historyRange: 90,
  focusName: false,
};
