import { KeyRound, Send } from "lucide-react";
import GlassModal from "@/components/library/GlassModal";
import { useLanguage } from "@/components/LanguageProvider";

interface PasswordResetHelpProps {
  open: boolean;
  onClose: () => void;
  botUsername?: string | null;
}

/**
 * شرح استعادة كلمة المرور عبر بوت تليجرام (لا يوجد SMTP في الموقع).
 */
export default function PasswordResetHelp({ open, onClose, botUsername }: PasswordResetHelpProps) {
  const { t } = useLanguage();
  const username = botUsername?.replace(/^@/, "") || null;

  return (
    <GlassModal open={open} onClose={onClose} title={t("استعادة كلمة المرور", "Password recovery")}>
      <div className="flex flex-col gap-4 text-sm text-app-2">
        <p className="flex items-start gap-2">
          <KeyRound size={16} className="mt-0.5 shrink-0 text-accent" />
          <span>
            {username
              ? t(
                  `افتح بوت تليجرام @${username} وأرسل /reset — ستصلك كلمة مرور مؤقتة داخل تليجرام (يتطلب أن يكون حسابك مربوطًا مسبقًا).`,
                  `Open the Telegram bot @${username} and send /reset — you'll receive a temporary password inside Telegram (requires your account to be linked beforehand).`,
                )
              : t(
                  "افتح بوت تليجرام الخاص بالموقع وأرسل /reset — ستصلك كلمة مرور مؤقتة داخل تليجرام (يتطلب أن يكون حسابك مربوطًا مسبقًا).",
                  "Open the site's Telegram bot and send /reset — you'll receive a temporary password inside Telegram (requires your account to be linked beforehand).",
                )}
          </span>
        </p>
        {username && (
          <a
            href={`https://t.me/${username}?start=reset`}
            target="_blank"
            rel="noreferrer"
            className="btn-primary w-full !py-2.5 text-sm"
          >
            <Send size={15} />
            {t("فتح البوت في تليجرام", "Open bot in Telegram")}
          </a>
        )}
      </div>
    </GlassModal>
  );
}
