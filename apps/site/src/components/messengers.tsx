import Image from "next/image";
import maxIcon from "@/assets/max.png";
import { COMPANY } from "@/config/company";

/**
 * Рисунки — одним цветом (currentColor): в цветном варианте он белый на фирменном фоне,
 * в монохромном (подвал) — светло-серый на едва заметной подложке.
 * У Max в цветном варианте настоящий значок-картинка, в монохромном — его контур.
 */
const ITEMS = [
  {
    key: "max",
    label: "Написать в Max",
    goal: "max_click",
    color: "#5b3df0",
    glyph: (
      <path
        fill="currentColor"
        fillRule="nonzero"
        stroke="currentColor"
        strokeWidth=".6"
        strokeLinejoin="round"
        d="M12.2 4.4a7.2 7.2 0 1 1 0 14.4 7.2 7.2 0 1 1 0-14.4ZM6.3 15l3.5 2.6-2.4 2H5.6ZM12.2 8.1a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 1 0 0-6.6Z"
      />
    ),
  },
  {
    key: "whatsapp",
    label: "Написать в WhatsApp",
    goal: "whatsapp_click",
    color: "#25d366",
    glyph: (
      <path
        fill="currentColor"
        d="M12 5.2a6.8 6.8 0 0 0-5.85 10.27L5.2 18.8l3.6-.94A6.8 6.8 0 1 0 12 5.2Zm0 1.5a5.3 5.3 0 1 1-2.7 9.86l-.22-.13-1.9.5.51-1.85-.14-.23A5.3 5.3 0 0 1 12 6.7Zm-2.3 2.6c-.13 0-.35.05-.53.25s-.7.68-.7 1.66.72 1.93.82 2.06c.1.13 1.4 2.2 3.4 3 1.66.66 2 .53 2.36.5.36-.03 1.16-.47 1.32-.93.16-.46.16-.85.11-.93-.05-.08-.18-.13-.38-.23s-1.16-.57-1.34-.64c-.18-.06-.31-.1-.44.1s-.5.64-.62.77c-.11.13-.23.15-.43.05-.2-.1-.83-.31-1.58-.97-.58-.52-.98-1.16-1.1-1.36-.11-.2-.01-.3.09-.4.09-.09.2-.23.3-.35.1-.11.13-.2.2-.33.06-.13.03-.25-.02-.35-.05-.1-.44-1.08-.61-1.47-.16-.39-.33-.34-.44-.34h-.37Z"
      />
    ),
  },
  {
    key: "telegram",
    label: "Написать в Telegram",
    goal: "telegram_click",
    color: "#229ed9",
    glyph: (
      <path
        fill="currentColor"
        d="M17.9 6.9 5.6 11.6c-.84.34-.83.8-.15 1l3.15.98 7.3-4.6c.34-.2.66-.09.4.13l-5.9 5.33-.22 3.25c.32 0 .46-.15.64-.32l1.57-1.52 3.26 2.4c.6.33 1.03.16 1.18-.55l2.14-10.1c.22-.88-.34-1.28-.97-1Z"
      />
    ),
  },
] as const;

/**
 * Значки мессенджеров (Max, WhatsApp, Telegram) — один номер на все три. Вместо телефона
 * в шапке, подвале и контактах (решение владельца 30.09.2026). Цели Метрики — по data-goal,
 * см. components/analytics/metrika.tsx. `mono` — сдержанный вариант для тёмного подвала.
 */
export function Messengers({
  size = 40,
  mono = false,
  className = "",
}: {
  size?: number;
  mono?: boolean;
  className?: string;
}) {
  return (
    <ul className={`flex items-center gap-2 ${className}`}>
      {ITEMS.map((item) => (
        <li key={item.key}>
          <a
            href={COMPANY.messengers[item.key]}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={item.label}
            title={item.label}
            data-goal={item.goal}
            style={{ width: size, height: size, ...(mono ? {} : { backgroundColor: item.color }) }}
            className={`flex items-center justify-center overflow-hidden rounded-full transition-colors ${
              mono ? "bg-white/10 text-[#c5cbc6] hover:bg-white/20 hover:text-white" : "text-white hover:opacity-85"
            }`}
          >
            {mono || item.key !== "max" ? (
              <svg viewBox="3.5 3.5 17 17" width={size * 0.8} height={size * 0.8} aria-hidden="true">
                {item.glyph}
              </svg>
            ) : (
              // Официальный значок Max; картинка мелкая, мимо оптимизатора (как логотип)
              <Image src={maxIcon} alt="" width={size} height={size} unoptimized className="size-full" />
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
