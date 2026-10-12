"use client";

import { Mail, MailCheck, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EMAIL_TEMPLATE_KEYS, EMAIL_TEMPLATE_LABELS, type EmailTemplateKey } from "@buscom/domain/email/templates";
import { markEmailsReadAction, resendOrderConfirmationAction, sendOrderEmailAction } from "@/app/(app)/mail/actions";
import { CustomerEmailFeed } from "./customer-email-feed";
import type { EmailView } from "./email-thread";

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
  totalEmails,
  customerId,
  defaultTo,
  replySubject,
  templates,
  suggestions,
  invoiceAvailable,
  supplierInvoices,
  mailReady,
}: {
  orderId: string;
  orderNumber: number;
  /** Последние письма переписки с клиентом — не только по этому заказу */
  emails: EmailView[];
  totalEmails: number;
  customerId: string;
  /** Кому по умолчанию: тому, кто написал последним, иначе адрес из карточки клиента */
  defaultTo: string | null;
  /** Тема по умолчанию: ответ на последнее входящее или «Заказ №…» */
  replySubject: string;
  templates: Record<EmailTemplateKey, Draft>;
  suggestions: EmailTemplateKey[];
  invoiceAvailable: boolean;
  /** Счета, прикреплённые в блоке «Поставщики», — их можно приложить к письму клиенту */
  supplierInvoices: { id: string; supplierName: string; fileName: string }[];
  mailReady: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo ?? "");
  const [template, setTemplate] = useState<EmailTemplateKey | null>(null);
  const [subject, setSubject] = useState(replySubject);
  const [body, setBody] = useState("");
  const [attachInvoice, setAttachInvoice] = useState(false);
  const [supplierInvoiceIds, setSupplierInvoiceIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  // Повтор письма о заказе — то же, что уходит покупателю после заказа с сайта
  const [resendOpen, setResendOpen] = useState(false);
  const [resendTo, setResendTo] = useState(defaultTo ?? "");
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
    setSupplierInvoiceIds([]);
  }

  function startLetter(key: EmailTemplateKey | null) {
    applyTemplate(key);
    setOpen(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function send() {
    startTransition(async () => {
      const result = await sendOrderEmailAction({
        orderId,
        orderNumber,
        to,
        subject,
        body,
        template,
        attachInvoice,
        // Файл могли убрать в блоке «Поставщики», пока форма открыта
        supplierInvoiceIds: supplierInvoiceIds.filter((id) => supplierInvoices.some((doc) => doc.id === id)),
      });
      if (result.ok) {
        toast.success("Письмо отправлено");
        setOpen(false);
        applyTemplate(null);
      } else toast.error(result.error);
    });
  }

  function resendConfirmation() {
    startTransition(async () => {
      const result = await resendOrderConfirmationAction({ orderId, orderNumber, to: resendTo });
      if (result.ok) {
        toast.success("Письмо о заказе отправлено");
        setResendOpen(false);
      } else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading font-medium">
          Переписка с клиентом
          {totalEmails > 0 ? (
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {totalEmails} ·{" "}
              <Link href={`/customers/${customerId}`} className="hover:text-foreground underline">
                карточка клиента
              </Link>
            </span>
          ) : null}
        </h2>
        <div className="flex flex-wrap justify-end gap-2">
          {!resendOpen ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setResendOpen(true)}
              title="Повторить письмо, которое покупатель получает после заказа на сайте"
            >
              <MailCheck />
              Письмо о заказе
            </Button>
          ) : null}
          {!open ? (
            <Button size="sm" variant="outline" onClick={() => startLetter(null)}>
              <Mail />
              Написать клиенту
            </Button>
          ) : null}
        </div>
      </div>

      {resendOpen ? (
        <div className="bg-muted/40 flex flex-col gap-2 rounded-md border px-3 py-2">
          <p className="text-sm">
            Отправить клиенту письмо о заказе — то же, что уходит после заказа на сайте: состав, сумма, доставка и как
            оплатить. Письмо ляжет в переписку.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs" htmlFor="resend-to">
              Кому
            </Label>
            <Input
              id="resend-to"
              value={resendTo}
              onChange={(event) => setResendTo(event.target.value)}
              placeholder="client@mail.ru"
              className="h-8 w-64"
            />
            <Button size="sm" onClick={resendConfirmation} disabled={pending || !mailReady}>
              <Send />
              {pending ? "Отправляется…" : "Отправить"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResendOpen(false)} disabled={pending}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      {!mailReady ? (
        <p className="text-muted-foreground text-xs">
          Почта не настроена — письма не уйдут. Администратор заполняет «Администрирование → Настройки почты».
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
          Переписки с клиентом пока нет.{defaultTo ? "" : " У клиента не указан email — адрес впишите в форме письма."}
        </p>
      ) : (
        <CustomerEmailFeed
          key={emails.map((email) => email.id).join(",")}
          customerId={customerId}
          initial={emails}
          total={totalEmails}
        />
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
          {supplierInvoices.length > 0 ? (
            supplierInvoices.map((doc) => (
              <label key={doc.id} className="flex w-fit items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={supplierInvoiceIds.includes(doc.id)}
                  onChange={(event) =>
                    setSupplierInvoiceIds((ids) =>
                      event.target.checked ? [...ids, doc.id] : ids.filter((id) => id !== doc.id),
                    )
                  }
                  className="accent-primary size-4"
                />
                Приложить счёт поставщика
                <span className="text-muted-foreground max-w-80 truncate text-xs" title={doc.fileName}>
                  {supplierInvoices.length > 1 ? `${doc.supplierName} · ` : ""}
                  {doc.fileName}
                </span>
              </label>
            ))
          ) : (
            <label className="flex w-fit items-center gap-2 text-sm" title="Прикрепите счёт в блоке «Поставщики»">
              <input type="checkbox" checked={false} disabled className="accent-primary size-4" />
              Приложить счёт поставщика
              <span className="text-muted-foreground text-xs">— счёт не прикреплён в блоке «Поставщики»</span>
            </label>
          )}
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
