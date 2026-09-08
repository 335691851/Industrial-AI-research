import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page">
      <h1>页面不存在</h1>
      <Link href="/">返回工业智能导航</Link>
    </main>
  );
}
