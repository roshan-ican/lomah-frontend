import { ActiveShooterChannel } from "@/src/types";
import { shooterDisplayName } from "@/src/utils/shooterDisplay";
import {
  targetProfileFromTargetId,
  targetProfileLabel,
} from "@/src/utils/targetProfile";

export // ── Shared session info card ──────────────────────────────────────────────────
const SessionInfoCard = ({
  channel,
  isAr,
  isHud = false,
}: {
  channel: ActiveShooterChannel;
  isAr: boolean;
  isHud?: boolean;
}) => (
  <div
    className={`p-3 rounded-xl admin-text-xs space-y-1.5 ${
      isHud
        ? "hud-info-card"
        : "bg-gray-50 dark:bg-[#121417]/85 border border-gray-200 dark:border-glass-border"
    }`}
  >
    <div>
      {isAr ? "اسم المستخدم:" : "Username:"}{" "}
      <strong
        className={
          isHud ? "text-[#00FFD1]" : "text-emerald-600 dark:text-emerald-400"
        }
      >
        {shooterDisplayName(
          channel.name,
          channel.opId,
          isAr ? "غير معيّن" : "Unassigned",
        )}
      </strong>
    </div>
    <div>
      {isAr ? "الهدف:" : "Target:"}{" "}
      <strong>
        {targetProfileLabel(
          targetProfileFromTargetId(channel.targetName),
          isAr ? "ar" : "en",
        )}{" "}
        ({channel.distance})
      </strong>
    </div>
    <div>
      {isAr ? "الحد الأقصى للطلقات:" : "Bullet Limit:"}{" "}
      <strong>
        {channel.bulletLimit && channel.bulletLimit > 0
          ? channel.bulletLimit
          : isAr
            ? "غير محدود"
            : "Unlimited"}
      </strong>
    </div>
    {channel.notes && (
      <div>
        {isAr ? "ملاحظات:" : "Notes:"}{" "}
        <span className="text-gray-400 italic">{channel.notes}</span>
      </div>
    )}
    <div>
      {isAr ? "حالة الجلسة:" : "Session State:"}{" "}
      <span
        className={`font-bold uppercase ${
          isHud ? "text-[#00FFD1]" : "text-emerald-500"
        }`}
      >
        {channel.sessionStatus}
      </span>
    </div>
  </div>
);
