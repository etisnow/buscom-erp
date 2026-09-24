"use client";

import { Mail, Send } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EMAIL_TEMPLATE_KEYS, EMAIL_TEMPLATE_LABELS, type EmailTemplateKey } from "@/domain/email/templates";
import { markEmailsReadAction, sendOrderEmailAction } from "@/app/(app)/mail/actions";
import { EmailMessage, type EmailView } from "./email-thread";

const NO_TEMPLATE = "__none__";

type Draft = { subject: string; body: string };

const SUGGESTION_TEXT: Partial<Record<EmailTemplateKey, string>> = {
  paid: "Заказ оплачен полностью — сообщить клиенту?",
  shipped: "Трек-номер вписан — сообщить клиенту об отправке?",
};

/**
 * Переписка с клиентом в карточке заказа (PRD, M6.2). Шаблоны уже заполнены
 * на сервере данными заказа — здесь их только подставляют в форму, где текст
 * можно поправить перед отправкой. Само письмо собирает и отправляет сервер.
 */
export function OrderEmails({
  orderId,
  orderNumber,
  emails,
  defaultTo,
  replySubject,
  templates,
  suggestions,
  invoiceAvailable,
  mailReady,
}: {
  orderId: string;
  orderNumber: number;
  emails: EmailView[];
  /** Кому по умолчанию: тому, кто написал последним, иначе адрес из карточки клиента */
  defaultTo: string | null;
  /** Тема по умолчанию: ответ на последнее входящее или «Заказ №…» */
  replySubject: string;
  templates: Record<EmailTemplateKey, Draft>;
  suggestions: EmailTemplateKey[];
  invoiceAvailable: boolean;
  mailReady: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo ?? "");
  const [template, setTemplate] = useState<EmailTemplateKey | null>(null);
  const [subject, setSubject] = useState(replySubject);
  const [body, setBody] = useState("");
  const [attachInvoice, setAttachInvoice] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLDivElement>(null);

  // Открыли заказ — входящие письма по нему прочитаны. Один раз на набор непрочитанных.
  const unreadIds = emails.filter((email) => email.unread).map((email) => email.id);
  const unreadKey = unreadIds.join(",");
  useEffect(() => {
    if (unreadKey) void markEmailsReadAction(unreadKey.split(","));
  }, [unreadKey]);

  function applyTemplate(key: EmailTemplateKey | null) {
    setTemplate(key);
    if (key) {
      setSubject(templates[key].subject);
      setBody(templates[key].body);
      setAttachInvoice(key === "invoice" && invoiceAvailable);
    } else {
      setSubject(replySubject);
      setBody("");
      setAttachInvoice(false);
    }
  }

  function startLetter(key: EmailTemplateKey | null) {
    applyTemplate(key);
    setOpen(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function send() {
    startTransition(async () => {
      const result = await sendOrderEmailAction({ orderId, orderNumber, to, subject, body, template, attachInvoice });
      if (result.ok) {
        toast.success("Письмо отправлено");
        setOpen(false);
        applyTemplate(null);
      } else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading font-medium">Переписка</h2>
        {!open ? (
          <Button size="sm" variant="outline" onClick={() => startLetter(null)}>
            <Mail />
            Написать клиенту
          </Button>
        ) : null}
      </div>

      {!mailReady ? (
        <p className="text-muted-foreground text-xs">
          Почта не настроена — письма не уйдут. Администратор заполняет раздел «Почта» в справочниках.
        </p>
      ) : null}

      {suggestions.map((key) => (
        <div
          key={key}
          className="border-primary/40 bg-primary/5 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <span>{SUGGESTION_TEXT[key]}</span>
          <Button size="sm" onClick={() => startLetter(key)}>
            {EMAIL_TEMPLATE_LABELS[key]}
          </Button>
        </div>
      ))}

      {emails.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Писем по заказу пока нет.{defaultTo ? "" : " У клиента не указан email — адрес впишите в форме письма."}
        </p>
      ) : (
        <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
          {emails.map((email) => (
            <EmailMessage key={email.id} email={email} />
          ))}
        </div>
      )}

      {open ? (
        <div ref={formRef} className="flex flex-col gap-3 border-t pt-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs" htmlFor="email-to">
                Кому
              </Label>
              <Input
                id="email-to"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="client@mail.ru"
                className="h-8"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs" htmlFor="email-template">
                Шаблон
              </Label>
              <Select
                value={template ?? NO_TEMPLATE}
                onValueChange={(value) => applyTemplate(value === NO_TEMPLATE ? null : (value as EmailTemplateKey))}
              >
                <SelectTrigger id="email-template" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>Без шаблона</SelectItem>
                  {EMAIL_TEMPLATE_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {EMAIL_TEMPLATE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="email-subject">
              Тема
            </Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="h-8"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="email-body">
              Текст
            </Label>
            <Textarea id="email-body" value={body} onChange={(event) => setBody(event.target.value)} rows={9} />
          </div>
          <label
            className="flex w-fit items-center gap-2 text-sm"
            title={invoiceAvailable ? undefined : "Заполните реквизиты продавца в справочниках"}
          >
            <input
              type="checkbox"
              checked={attachInvoice}
              disabled={!invoiceAvailable}
              onChange={(event) => setAttachInvoice(event.target.checked)}
              className="accent-primary size-4"
            />
            Приложить счёт PDF
            {!invoiceAvailable ? (
              <span className="text-muted-foreground text-xs">— нет реквизитов продавца</span>
            ) : null}
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={send} disabled={pending || !mailReady}>
              <Send />
              {pending ? "Отправляется…" : "Отправить"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
