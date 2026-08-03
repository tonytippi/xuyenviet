import { FacebookCaptureDetail } from "./detail";
export default async function Page({ params }: { params: Promise<{ reviewId: string }> }) { return <FacebookCaptureDetail reviewId={(await params).reviewId} />; }
