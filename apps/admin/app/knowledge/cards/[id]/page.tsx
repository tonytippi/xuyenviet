import { KnowledgeCardDetail } from "../../review-client";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <KnowledgeCardDetail id={(await params).id} />; }
