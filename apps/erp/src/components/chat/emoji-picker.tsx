"use client";

import { useState } from "react";
import { Smile } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";

/** Набор под рабочий чат: лица, жесты, дела и предметы. Сам по себе — без библиотеки эмодзи. */
const GROUPS: { title: string; emoji: string[] }[] = [
  {
    title: "Лица",
    emoji: [..."😀😃😄😁😆😅😂🤣🙂😉😊😍🥰😘😎🤔😐😴😢😭😡😱🙄😬🤝"],
  },
  {
    title: "Жесты",
    // ✌ и 🛠 без селектора представления рисуются чёрно-белым значком, поэтому ️ дописан явно
    emoji: [..."👍👎👌🤞👏🙌🙏💪👋🤷👀", "✌️"],
  },
  {
    title: "Дела",
    emoji: [..."✅❌❗❓🔥⭐💯🎉🎁📦🚚🚛🚌🔧💰💳📞📧📎📌⏰📅🕐", "⚠️", "🛠️"],
  },
];

/**
 * Кнопка со всплывающей панелью эмодзи. Выбранный знак вставляется туда, где стоит курсор в
 * поле ввода; в поле ввода панель остаётся открытой — можно выбрать несколько подряд (закрывается Esc или щелчком мимо).
 */
export function EmojiPicker({
  onPick,
  disabled,
  trigger,
  closeOnPick = false,
  side = "top",
}: {
  onPick: (emoji: string) => void;
  disabled?: boolean;
  /** Своя кнопка вместо смайлика в поле ввода — например, «поставить реакцию» у сообщения */
  trigger?: React.ReactNode;
  /** Для реакций — одна на нажатие; в поле ввода панель остаётся открытой */
  closeOnPick?: boolean;
  side?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" aria-label="Эмодзи" title="Эмодзи" disabled={disabled}>
            <Smile />
          </Button>
        )}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align="start"
          sideOffset={6}
          // Фокус остаётся в поле ввода: иначе после выбора эмодзи пришлось бы щёлкать в него заново
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="bg-popover text-popover-foreground ring-foreground/10 z-50 max-h-72 w-72 overflow-y-auto rounded-xl p-2 shadow-md ring-1"
        >
          {GROUPS.map((group) => (
            <div key={group.title} className="mb-1 last:mb-0">
              <div className="text-muted-foreground px-1 pt-1 pb-0.5 text-xs">{group.title}</div>
              <div className="grid grid-cols-8 gap-0.5">
                {group.emoji.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    // mousedown не отбирает фокус у поля ввода — курсор остаётся на месте
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onPick(emoji);
                      if (closeOnPick) setOpen(false);
                    }}
                    className="hover:bg-muted flex size-8 items-center justify-center rounded-md text-xl"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
