import { YoutubeCaptureDetail } from "./detail";
export default async function Page({ params }: { params: Promise<{ sourceId: string }> }) { return <YoutubeCaptureDetail sourceId={(await params).sourceId} />; }
