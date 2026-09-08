"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>工作台暂时无法显示</h1>
      <p>请重试，或检查服务连接状态。</p>
      <button onClick={reset}>重新加载</button>
    </main>
  );
}
