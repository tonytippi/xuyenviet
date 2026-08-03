import { DraftDetail } from "../../review-client"; export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <DraftDetail id={(await params).id} />; }
