import { ApprovedDetail } from "../../review-client"; export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <ApprovedDetail id={(await params).id} />; }
