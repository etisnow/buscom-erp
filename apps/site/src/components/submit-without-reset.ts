/**
 * Отправка формы без автосброса. `<form action={…}>` в React 19 после отправки
 * очищает все неуправляемые поля — даже когда сервер вернул ошибки, и покупателю
 * приходится вводить всё заново. Здесь форма собирается вручную и остаётся как есть.
 */
export function submitWithoutReset(handler: (formData: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handler(new FormData(event.currentTarget));
  };
}
