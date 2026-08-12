import { Link } from "react-router";
import { motion } from "framer-motion";
import { LogIn, UserPlus } from "lucide-react";
import { LOGIN_PATH } from "@/const";
import { useLanguage } from "@/components/LanguageProvider";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface GuestGateProps {
  heading: string;
  copy: string;
}

/** حالة الزائر الغنية: لوحة زجاجية مع صورة جانبية ودعوة لتسجيل الدخول. */
export default function GuestGate({ heading, copy }: GuestGateProps) {
  const { t } = useLanguage();
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="glass gradient-hero-bg mx-auto max-w-3xl overflow-hidden"
    >
      <div className="flex flex-col items-center gap-8 p-8 md:flex-row md:p-12">
        {/* decorative side (desktop) */}
        <motion.div
          animate={{ y: [-6, 6, -6] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          className="hidden w-52 shrink-0 md:block"
        >
          <img
            src="/auth-side.png"
            alt=""
            className="w-full rounded-3xl border border-app object-cover shadow-xl"
          />
        </motion.div>

        <div className="text-center md:text-start">
          <img src="/empty-state.svg" alt="" className="mx-auto w-40 opacity-90 md:hidden" />
          <h2 className="font-display mt-4 text-2xl font-bold text-app md:mt-0 md:text-3xl">
            {heading}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-app-2">{copy}</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row md:justify-start">
            <Link to={LOGIN_PATH} className="btn-primary">
              <LogIn size={17} />
              {t("تسجيل الدخول", "Sign in")}
            </Link>
            <Link to={LOGIN_PATH} className="btn-glass">
              <UserPlus size={17} />
              {t("إنشاء حساب", "Create account")}
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
