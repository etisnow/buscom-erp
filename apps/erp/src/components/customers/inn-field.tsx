"use client";

import { useTransition } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { companyStatusWarning, type CompanyInfo } from "@buscom/domain/customer/company-lookup";
import { lookupCompanyAction } from "@/app/(app)/customers/actions";

/**
 * Поле ИНН с кнопкой «Заполнить»: тянет данные юрлица из ЕГРЮЛ (через DaData)
 * и отдаёт их форме в `onFound`. Что куда переносить, решает форма —
 * обычно через `applyCompanyInfo`. Ничего не сохраняет.
 */
export function InnField({
  id,
  value,
  onChange,
  onFound,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onFound: (company: CompanyInfo) => void;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function lookup() {
    startTransition(async () => {
      const result = await lookupCompanyAction(value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      onFound(result.company);
      const warning = companyStatusWarning(result.company.status);
      if (warning) toast.warning(`${warning}: ${result.company.name}`);
      else toast.success(`Заполнено по ЕГРЮЛ: ${result.company.name}. Проверьте и сохраните`);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs" htmlFor={id}>
        ИНН
      </Label>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter в поле ИНН — то же, что кнопка: так быстрее, чем тянуться мышью
            if (event.key === "Enter" && value.trim() && !pending) {
              event.preventDefault();
              lookup();
            }
          }}
          disabled={disabled}
          className="h-8 min-w-0"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          title="Заполнить название, КПП и реквизиты по ИНН"
          disabled={disabled || pending || !value.trim()}
          onClick={lookup}
        >
          <Search className={pending ? "animate-pulse" : undefined} />
          Заполнить
        </Button>
      </div>
    </div>
  );
}
