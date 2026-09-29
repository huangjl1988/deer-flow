import { redirect } from "next/navigation";

// self-hosted 单用户部署：打开首页直接进入工作台，跳过营销落地页。
// 如需恢复公开落地页，把本文件改回渲染 LandingPage 即可。
export default function HomePage() {
  redirect("/workspace");
}

