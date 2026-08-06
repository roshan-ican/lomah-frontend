import React from "react";
import {
  BookOpen,
  Info,
  ShieldAlert,
  CheckCircle,
  Layers,
  Hand,
  Play,
  Crosshair,
  Users,
  FileText,
  Compass,
} from "lucide-react";
import { TranslationSet } from "../../../translations";

interface AdminHelpProps {
  language: "en" | "ar";
  t: TranslationSet;
}

function GuideCard({
  icon,
  title,
  children,
  variant = "default",
  className = "",
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  variant?: "default" | "danger";
  className?: string;
}) {
  return (
    <div
      className={`hud-glass rounded-lg p-4 sm:p-5 min-h-0 flex flex-col overflow-hidden ${className}`}
    >
      <h2
        className={`admin-text-sm mb-3 flex items-center gap-2 shrink-0 ${
          variant === "danger" ? "hud-danger" : "hud-accent"
        }`}
      >
        {icon}
        {title}
      </h2>
      <div className="admin-text-sm font-mono hud-text-secondary leading-relaxed">
        {children}
      </div>
    </div>
  );
}

/** A labelled step / key-value line used inside guide cards. */
function Step({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <strong className="hud-text">{term}</strong>
      {children}
    </li>
  );
}

export const AdminHelp: React.FC<AdminHelpProps> = ({ language }) => {
  const isAr = language === "ar";

  return (
    <div
      className="flex flex-col gap-4 max-w-7xl mx-auto h-full overflow-y-auto pb-6"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="shrink-0 border-b border-hud pb-3">
        <h1 className="hud-accent admin-text-lg flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          {isAr
            ? "دليل ضابط الميدان والتشغيل"
            : "RANGE OFFICER ADMIN GUIDE & MANUAL"}
        </h1>
        <p className="admin-text-xs font-mono hud-text-muted mt-1.5 leading-relaxed">
          {isAr
            ? "مرجع سريع لتشغيل الميدان: بدء الجلسات، التحكم بالمستشعر، المعايرة، وتصدير النتائج."
            : "Quick reference for running the range — starting sessions, controlling the sensor, calibrating, and exporting results."}
        </p>
      </div>

      {/* ── Lane status legend ─────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border flex gap-2.5 hud-lane-card--live min-h-0">
          <span className="w-3 h-3 rounded-full bg-[var(--hud-success)] shrink-0 mt-1 animate-pulse shadow-[var(--hud-shadow-live)]" />
          <div className="min-w-0">
            <p className="font-mono font-bold admin-text-xs hud-success uppercase">
              {isAr ? "مباشر — تسجيل" : "Live — recording"}
            </p>
            <p className="admin-text-xs font-mono hud-text-muted mt-1 leading-relaxed">
              {isAr
                ? "الحارة تسجل إحداثيات الطلقات في الوقت الفعلي."
                : "Lane is logging shot coordinates in real time."}
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg border flex gap-2.5 hud-status-paused min-h-0">
          <span className="w-3 h-3 rounded-full bg-[var(--hud-warning)] shrink-0 mt-1" />
          <div className="min-w-0">
            <p className="font-mono font-bold admin-text-xs hud-warning uppercase">
              {isAr ? "موقوف / منتهٍ" : "Paused / done"}
            </p>
            <p className="admin-text-xs font-mono hud-text-muted mt-1 leading-relaxed">
              {isAr
                ? "قياس المستشعر متوقف مؤقتاً أو انتهت الجلسة."
                : "Sensor acquisition is suspended, or the session has ended."}
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg border flex gap-2.5 hud-status-vacant min-h-0">
          <span className="w-3 h-3 rounded-full bg-[var(--hud-text-subtle)] shrink-0 mt-1" />
          <div className="min-w-0">
            <p className="font-mono font-bold admin-text-xs hud-text-secondary uppercase">
              {isAr ? "شاغرة" : "Vacant"}
            </p>
            <p className="admin-text-xs font-mono hud-text-muted mt-1 leading-relaxed">
              {isAr
                ? "لا توجد جلسة على الحارة — جاهزة للتهيئة."
                : "No session on the lane — ready to initialize."}
            </p>
          </div>
        </div>
      </div>

      {/* ── Guide cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* 1 — Navigation */}
        <GuideCard
          icon={<Compass className="w-4 h-4" />}
          title={isAr ? "١. لوحة الملاحة" : "1. Console navigation"}
        >
          <ul className="space-y-1.5 list-disc pl-4">
            <Step term={isAr ? "تحكم الميدان" : "Range Ops"}>
              {isAr
                ? " — الشبكة المباشرة لكل الحارات."
                : " — the live grid of every lane."}
            </Step>
            <Step term={isAr ? "سجل الجلسات" : "Session History"}>
              {isAr
                ? " — الجلسات السابقة ونتائجها."
                : " — past sessions and their results."}
            </Step>
            <Step term={isAr ? "الرُماة" : "Shooters"}>
              {isAr
                ? " — الأجهزة اللوحية المتصلة وتعيينها للحارات."
                : " — connected tablets and lane assignment."}
            </Step>
            <Step term={isAr ? "التقارير" : "Analytics"}>
              {isAr
                ? " — الإحصاءات وتصدير CSV."
                : " — statistics and CSV export."}
            </Step>
          </ul>
        </GuideCard>

        {/* 2 — Starting a session */}
        <GuideCard
          icon={<Play className="w-4 h-4" />}
          title={isAr ? "٢. بدء جلسة" : "2. Start a session"}
        >
          <ol className="space-y-1.5 list-decimal pl-4">
            <li>
              {isAr
                ? 'اختر حارة شاغرة واضغط "تهيئة وتعيين الجلسة".'
                : 'Pick a vacant lane and press "Create Session".'}
            </li>
            <li>
              {isAr
                ? "عيّن الرامي، المدة (٥/١٠/١٥ د)، نوع الهدف، المسافة، وعدد الطلقات."
                : "Set the shooter, duration (5/10/15 min), target type, distance, and bullet count."}
            </li>
            <li>
              {isAr
                ? 'اضغط "بدء الجلسة" لبدء التسجيل المباشر.'
                : 'Press "Activate Session" to begin live recording.'}
            </li>
          </ol>
        </GuideCard>

        {/* 3 — Session controls */}
        <GuideCard
          icon={<CheckCircle className="w-4 h-4" />}
          title={isAr ? "٣. التحكم بالجلسة" : "3. Session controls"}
        >
          <ul className="space-y-1.5 list-disc pl-4">
            <Step term={isAr ? "تعليق / استئناف" : "Pause / Resume"}>
              {isAr
                ? " — تجميد أو متابعة التسجيل."
                : " — freeze or continue recording."}
            </Step>
            <Step term={isAr ? "تعديل الجلسة" : "Edit Config"}>
              {isAr
                ? " — تغيير الإعداد قبل البدء."
                : " — change settings before activating."}
            </Step>
            <Step term={isAr ? "إنهاء الجلسة" : "End Session"}>
              {isAr
                ? " — إغلاق وأرشفة النتائج."
                : " — close and archive the results."}
            </Step>
            <Step term={isAr ? "تجاهل" : "Discard"}>
              {isAr
                ? " — إلغاء الجلسة دون حفظ."
                : " — cancel the session without saving."}
            </Step>
          </ul>
        </GuideCard>

        {/* 4 — Sensor hold / release */}
        <GuideCard
          icon={<Hand className="w-4 h-4" />}
          title={isAr ? "٤. المستشعر: إيقاف/تحرير" : "4. Sensor hold / release"}
        >
          <p>
            {isAr
              ? '"إيقاف المستشعر" يوقف قبول الطلقات مؤقتاً على مستوى الميدان — تظهر الحالة "المستشعر: متوقف".'
              : '"Hold sensor" pauses shot acquisition range-wide — the badge reads "Sensor: hold".'}
          </p>
          <p className="mt-2 hud-warning">
            {isAr
              ? "تنبيه: إذا كانت جلسة مباشرة تعمل والمستشعر متوقف، فلن تُسجَّل الطلقات. اضغط \"تحرير المستشعر\" لاستئناف القبول."
              : 'Note: if a session is live while the sensor is held, shots will not register. Press "Release sensor" to resume.'}
          </p>
        </GuideCard>

        {/* 5 — Range-wide controls */}
        <GuideCard
          icon={<Layers className="w-4 h-4" />}
          title={isAr ? "٥. تحكم الميدان الكامل" : "5. Range-wide controls"}
        >
          <ul className="space-y-1.5 list-disc pl-4">
            <Step term={isAr ? "تشغيل الكل" : "Start All Lanes"}>
              {isAr
                ? " — بدء كل الجلسات الجاهزة دفعة واحدة."
                : " — activate every ready session at once."}
            </Step>
            <Step term={isAr ? "إيقاف الكل" : "Pause All Lanes"}>
              {isAr
                ? " — تعليق كل الحارات المباشرة فوراً."
                : " — pause every live lane immediately."}
            </Step>
          </ul>
          <p className="mt-2 hud-text-muted">
            {isAr
              ? "اضغط على حارة لعرضها بملء الشاشة."
              : "Tap a lane to open its full-screen live view."}
          </p>
        </GuideCard>

        {/* 6 — Calibration */}
        <GuideCard
          icon={<Crosshair className="w-4 h-4" />}
          title={isAr ? "٦. المعايرة والمحاذاة" : "6. Calibration & alignment"}
        >
          <p>
            {isAr
              ? "إذا انحرفت الطلقات عن مواضعها الحقيقية، استخدم المعايرة لإعادة محاذاة اللوحة:"
              : "If shots land off from where they actually hit, use calibration to realign the board:"}
          </p>
          <ul className="space-y-1.5 list-disc pl-4 mt-2">
            <Step term={isAr ? "معايرة الحارة" : "Lane calibrate"}>
              {isAr
                ? " — ضبط إزاحة/مقياس اللوحة كاملة."
                : " — set the whole board's offset/scale."}
            </Step>
            <Step term={isAr ? "معايرة الطلقات" : "Shots calibrate"}>
              {isAr
                ? " — محاذاة الطلقات المسجّلة دقيقاً."
                : " — fine-align the recorded shots."}
            </Step>
          </ul>
          <p className="mt-2 hud-text-muted">
            {isAr
              ? "يمكنك حقن طلقات اختبار للتحقق قبل بدء الرماية الحقيقية."
              : "Inject test shots to verify before live fire begins."}
          </p>
        </GuideCard>

        {/* 7 — Assigning shooters */}
        <GuideCard
          icon={<Users className="w-4 h-4" />}
          title={isAr ? "٧. تعيين الرُماة" : "7. Assigning shooters"}
        >
          <p>
            {isAr
              ? 'من تبويب "الرُماة" تظهر الأجهزة اللوحية المتصلة. عيّن كل جهاز إلى حارة ليبدأ الرامي بالرؤية المباشرة، أو ألغِ التعيين لتحريره.'
              : 'The "Manage Shooters" tab lists connected tablets and registered shooters. Assign each device to a lane, or add new shooters and scan for devices.'}
          </p>
        </GuideCard>

        {/* 8 — Reports & review */}
        <GuideCard
          icon={<FileText className="w-4 h-4" />}
          title={isAr ? "٨. التقارير والتقييم" : "8. Reports & review"}
        >
          <ul className="space-y-1.5 list-disc pl-4">
            <Step term={isAr ? "التقارير" : "Analytics"}>
              {isAr
                ? " — راجع أداء الرامي وصدّر السجل كـ CSV."
                : " — review shooter performance, export history as CSV."}
            </Step>
            <Step term={isAr ? "تقييم المدرب" : "Instructor review"}>
              {isAr
                ? " — أضف ملاحظات للجلسة قبل إغلاقها."
                : " — add feedback to a session before closing it."}
            </Step>
          </ul>
        </GuideCard>

        {/* 9 — Status indicators */}
        <GuideCard
          icon={<Info className="w-4 h-4" />}
          title={isAr ? "٩. دلالات الحالة" : "9. Status indicators"}
        >
          <p>
            {isAr
              ? "الأخضر = مباشر، البرتقالي = موقوف أو منتهٍ، الرمادي = شاغرة. شارة \"المستشعر\" الخضراء تعني قبول الطلقات."
              : 'Green = live, amber = paused or done, gray = vacant. A green "Sensor" badge means shots are being accepted.'}
          </p>
        </GuideCard>

        {/* 10 — Troubleshooting */}
        <GuideCard
          icon={<ShieldAlert className="w-4 h-4" />}
          title={isAr ? "١٠. استكشاف الأخطاء" : "10. Troubleshooting"}
          variant="danger"
          className="md:col-span-2 xl:col-span-3"
        >
          <div className="space-y-2.5">
            <p>
              <strong className="hud-text">
                {isAr ? "فقدان الاتصال:" : "Connection lost:"}
              </strong>{" "}
              {isAr
                ? "تأكد من اتصال الأجهزة اللوحية بالشبكة، ثم أعد تشغيل الخدمة المحلية. يعيد النظام الاتصال تلقائياً خلال ثوانٍ."
                : "Verify the tablets' network access, then restart the local service. The system auto-reconnects within seconds."}
            </p>
            <p>
              <strong className="hud-text">
                {isAr ? "لا تُسجَّل الطلقات:" : "Shots not registering:"}
              </strong>{" "}
              {isAr
                ? "تحقق من أن المستشعر \"نشط\" وليس \"متوقف\"، وأن الجلسة مباشرة."
                : 'Check the sensor badge reads "live" (not "hold") and the session is active.'}
            </p>
            <p>
              <strong className="hud-text">
                {isAr ? "انحراف الإحداثيات:" : "Coordinate drift:"}
              </strong>{" "}
              {isAr
                ? "بدّل نوع الهدف أو استخدم المعايرة لإعادة ضبط اللوحة."
                : "Switch target profile or use calibration to realign the board."}
            </p>
          </div>
        </GuideCard>
      </div>
    </div>
  );
};
