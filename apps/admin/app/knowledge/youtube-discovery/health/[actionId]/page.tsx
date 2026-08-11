import { HealthIncidentDetail } from "./detail";

export default async function HealthActionPage({ params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}:(provider_rate_limited|triage_schema_invalid|execution_terminal)$/.test(actionId)) return <main><h1 className="text-3xl font-bold">Sức khỏe Discovery</h1><p className="mt-3 text-slate-700">Sự cố trong liên kết không khả dụng.</p></main>;
  return <HealthIncidentDetail groupId={actionId} />;
}
