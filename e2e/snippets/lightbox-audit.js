// e2e/snippets/lightbox-audit.js
// 量照片灯箱里图片的真实渲染尺寸（占屏幕比例），用来判断「照片太小」。
// 用法：node e2e/inspect.js --file e2e/snippets/lightbox-audit.js --vw 390 --vh 844
return new Promise((resolve) => {
  const lb = ensureLightbox();
  lb.style.display = 'flex';
  const img = lb.querySelector('#lb-img');
  const wrap = lb.firstElementChild;

  // 生成一张竖版测试图（3:4，模拟手机拍的竖照片）
  const c = document.createElement('canvas');
  c.width = 900; c.height = 1200;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7f8c8d';
  ctx.fillRect(0, 0, 900, 1200);

  const done = () => {
    requestAnimationFrame(() => {
      const r = img.getBoundingClientRect();
      const lbR = lb.getBoundingClientRect();
      const wR = wrap.getBoundingClientRect();
      const titleR = lb.querySelector('#lb-title').parentElement.getBoundingClientRect();
      const btnR = lb.querySelector('#lb-prev').parentElement.getBoundingClientRect();
      const cs = getComputedStyle(img);
      const res = {
        视口: window.innerWidth + 'x' + window.innerHeight,
        灯箱: [Math.round(lbR.width), Math.round(lbR.height)],
        内容区: [Math.round(wR.width), Math.round(wR.height)],
        标题栏高: Math.round(titleR.height),
        操作栏高: Math.round(btnR.height),
        图片: [Math.round(r.width), Math.round(r.height)],
        图片占屏宽: Math.round((r.width / lbR.width) * 1000) / 10 + '%',
        图片占屏高: Math.round((r.height / lbR.height) * 1000) / 10 + '%',
        maxHeight: cs.maxHeight,
        flex: cs.flex,
        内容区剩余可用高: Math.round(wR.height - titleR.height - btnR.height),
      };
      lb.style.display = 'none';
      resolve(res);
    });
  };

  img.onload = done;
  img.onerror = () => resolve({ err: '图片加载失败' });
  img.src = c.toDataURL('image/png');
  setTimeout(done, 700); // 兜底
});
