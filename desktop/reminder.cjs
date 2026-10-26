document.getElementById('close').onclick = () => window.reminderBridge.close();
window.reminderBridge.onData(({ items, kind, heading }) => {
  document.getElementById('heading').textContent = kind === 'timer' ? '◷ 专注与休息提醒' : '◷ 现在可以开始这件事';
  const box = document.getElementById('items'); box.replaceChildren();
  for (const task of items) {
    const article = document.createElement('article'), button = document.createElement('button'), title = document.createElement('strong'), time = document.createElement('small'), content = document.createElement('p');
    title.textContent = task.title; time.textContent = kind === 'timer' ? '点击返回专注页面' : `${task.start}–${task.end} · P${task.priority}`; content.textContent = task.content || '点击查看任务详情';
    button.append(title, time, content); button.onclick = () => window.reminderBridge.open(task.id); article.append(button); box.append(article);
  }
});
