/** IMAP отвечает не мгновенно — пока читается папка или письмо, показываем это. */
export default function MailboxLoading() {
  return <p className="text-muted-foreground p-2 text-sm">Читаю ящик…</p>;
}
