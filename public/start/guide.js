'use strict';
const form = document.getElementById('guide'),
  steps = [...document.querySelectorAll('[data-step]')];
const back = document.getElementById('back'),
  next = document.getElementById('next'),
  result = document.getElementById('result'),
  prompt = document.getElementById('prompt'),
  notice = document.getElementById('notice');
let step = 0;
document.getElementById('language').value = navigator.language.toLowerCase().startsWith('zh')
  ? 'zh'
  : 'en';
function show() {
  steps.forEach((el, i) => {
    el.hidden = i !== step;
  });
  back.hidden = step === 0;
  next.textContent = step === 2 ? '生成提示词 / Generate prompt' : '下一步 / Next';
}
next.addEventListener('click', () => {
  const focus = form.querySelector('input[name="focus"]:checked')?.value;
  if (!focus) {
    notice.textContent = '请先选择关注方向。Please choose a focus first.';
    return;
  }
  notice.textContent = '';
  if (step < 2) {
    step++;
    show();
    return;
  }
  const available_minutes = Number(document.getElementById('minutes').value),
    review_preference = document.getElementById('review').value;
  const args = {
    language: document.getElementById('language').value,
    focus,
    available_minutes,
    review_preference,
  };
  prompt.value =
    '请用 Personal Health 的 get_onboarding_guide 检查数据状态并完成引导。参数如下。不要保存目标或创建任务。\nUse Personal Health get_onboarding_guide with these preferences. Check data status; do not save goals or create tasks.\n' +
    JSON.stringify(args, null, 2);
  result.hidden = false;
  prompt.focus();
  prompt.select();
  notice.textContent = '提示词已生成，尚未发送。Prompt generated; nothing was sent.';
});
back.addEventListener('click', () => {
  step = Math.max(0, step - 1);
  result.hidden = true;
  prompt.value = '';
  show();
});
document.getElementById('clear-guide').addEventListener('click', () => {
  form.reset();
  step = 0;
  result.hidden = true;
  prompt.value = '';
  notice.textContent = '已清除当前页面回答。Local answers cleared.';
  show();
});
form.addEventListener('submit', (event) => event.preventDefault());
show();
