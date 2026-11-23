import './style.css';

const params = new URLSearchParams(location.search);

if (params.has('selftest')) {
  // 自检模式：?selftest=1，结果写入 window.__selftest 并展示在页面上
  import('./selftest').then((m) => m.runSelfTest());
} else if (params.has('shot')) {
  // 截图模式：?shot=1，渲染一个示例场景供人工检查
  Promise.all([import('./scene'), import('./gl/renderer')]).then(([sceneMod, glMod]) => {
    const scene = sceneMod.generateScene({ seed: 20261124, itemCount: 40, contrabandCount: 3 });
    const canvas = document.createElement('canvas');
    canvas.style.width = '1024px';
    document.body.appendChild(canvas);
    const renderer = new glMod.XRayRenderer(canvas, 1024);
    renderer.render(sceneMod.flattenScene(scene));
    //  sanity：累积光学厚度不应有负值（负值=网格绕向错误）
    const px = renderer.readAccum(0, 0, 1024, 1024);
    if (px) {
      let min = Infinity, neg = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] < min) min = px[i];
        if (px[i] < -1e-4) neg++;
      }
      console.log(`accum R: min=${min.toFixed(4)} negPixels=${neg}`);
    }
    (window as unknown as { __shotReady: boolean }).__shotReady = true;
  });
} else {
  import('./ui/app').then((m) => m.startApp(document.getElementById('app')!));
}
