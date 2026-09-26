"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GENERAL_TOPIC_GROUPS, supplierStageTopic } from "@/domain/notification/topics";
import { saveNotificationTopicsAction } from "@/app/(app)/settings/actions";

type Supplier = { id: string; name: string; stages: { id: string; name: string }[] };

function TopicCheckbox({
  id,
  checked,
  disabled,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0"
      />
      <label htmlFor={id} className="flex flex-col gap-0.5 text-sm">
        {children}
      </label>
    </li>
  );
}

export function NotificationTopicsForm({ topics, suppliers }: { topics: string[]; suppliers: Supplier[] }) {
  const [selected, setSelected] = useState<string[]>(topics);
  const [pending, startTransition] = useTransition();

  function toggle(topic: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, topic] : current.filter((item) => item !== topic)));
  }

  function toggleSupplier(supplier: Supplier, checked: boolean) {
    const keys = supplier.stages.map((stage) => supplierStageTopic(stage.id));
    setSelected((current) => [...current.filter((item) => !keys.includes(item)), ...(checked ? keys : [])]);
  }

  function save() {
    startTransition(async () => {
      const result = await saveNotificationTopicsAction(selected);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Уведомления</h2>
        <p className="text-muted-foreground text-sm">
          Отметьте, о чём присылать письма. Уведомления приходят по всем заказам, кроме изменений, которые вы сделали
          сами.
        </p>
      </div>

      {GENERAL_TOPIC_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-2">
          <div>
            <h3 className="text-sm font-medium">{group.title}</h3>
            <p className="text-muted-foreground text-sm">{group.description}</p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {group.topics.map((topic) => (
              <TopicCheckbox
                key={topic.key}
                id={`topic-${topic.key}`}
                checked={selected.includes(topic.key)}
                disabled={pending}
                onChange={(checked) => toggle(topic.key, checked)}
              >
                {topic.label}
              </TopicCheckbox>
            ))}
          </ul>
        </div>
      ))}

      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-medium">Этапы поставщиков</h3>
          <p className="text-muted-foreground text-sm">
            Письмо приходит, когда поставщик в заказе переходит на отмеченный этап.
          </p>
        </div>

        {suppliers.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ни у одного поставщика пока нет этапов.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {suppliers.map((supplier) => {
              const keys = supplier.stages.map((stage) => supplierStageTopic(stage.id));
              const all = keys.every((key) => selected.includes(key));
              return (
                <div key={supplier.id} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{supplier.name}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                      disabled={pending}
                      onClick={() => toggleSupplier(supplier, !all)}
                    >
                      {all ? "Снять все" : "Отметить все"}
                    </button>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {supplier.stages.map((stage) => {
                      const key = supplierStageTopic(stage.id);
                      return (
                        <TopicCheckbox
                          key={stage.id}
                          id={`topic-${stage.id}`}
                          checked={selected.includes(key)}
                          disabled={pending}
                          onChange={(checked) => toggle(key, checked)}
                        >
                          {stage.name}
                        </TopicCheckbox>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <Button size="sm" variant="outline" disabled={pending} onClick={save}>
          Сохранить
        </Button>
      </div>
    </section>
  );
}
