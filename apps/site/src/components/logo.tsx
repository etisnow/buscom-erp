import Image from "next/image";
import Link from "next/link";
import bus from "@/assets/logo-bus.png";

/**
 * Логотип из макета: «БАСКОМ», силуэт микроавтобуса, двухцветная черта и подпись.
 * `inverse` — белый вариант для тёмного подвала. Картинка мелкая и одна на весь
 * сайт, поэтому мимо оптимизатора (он пускает только /img/**, next.config.ts).
 */
export function Logo({ inverse = false, tagline = true }: { inverse?: boolean; tagline?: boolean }) {
  return (
    <Link href="/" aria-label="Баском — на главную" className="flex w-max shrink-0 flex-col gap-1">
      <span className="flex items-end gap-2">
        <span
          className={`text-[22px] leading-none font-extrabold tracking-[.02em] md:text-[28px] ${inverse ? "text-white" : "text-brand"}`}
        >
          БАСКОМ
        </span>
        <Image
          src={bus}
          alt=""
          unoptimized
          priority
          className={`h-5 w-auto md:h-[25px] ${inverse ? "brightness-0 invert" : ""}`}
        />
      </span>
      <span
        aria-hidden
        className={`h-0.5 rounded-full ${inverse ? "bg-[linear-gradient(90deg,#fff_0_70%,var(--color-accent)_70%_100%)]" : "bg-[linear-gradient(90deg,var(--color-brand)_0_70%,var(--color-accent)_70%_100%)]"}`}
      />
      {tagline && (
        <span className="text-muted hidden text-[10px] tracking-[.08em] whitespace-nowrap md:block">
          КОМПЛЕКТУЮЩИЕ ДЛЯ АВТОБУСОВ
        </span>
      )}
    </Link>
  );
}
