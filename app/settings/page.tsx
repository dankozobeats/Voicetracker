/**
 * Settings page placeholder to configure SaaS preferences.
 */
export default function SettingsPage() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
      <p>Configurez vos préférences utilisateur, alertes et paramètres d&apos;IA ici.</p>
      <p className="mt-2 text-xs text-slate-500">Les paramètres seront reliés à Supabase via la table user_preferences.</p>
    </div>
  );
}
