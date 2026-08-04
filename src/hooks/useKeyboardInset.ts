import { useEffect, useState } from "react";

/**
 * iOS WKWebView 不會為軟鍵盤縮小 layout viewport——固定在視窗底部的元素會被
 * 鍵盤蓋住。這個 hook 回傳鍵盤遮住的高度（px），由 visualViewport 推導；
 * 桌機與鍵盤收起時為 0。
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
