"use client";

// Граница ошибок страницы. Без неё любое исключение при отрисовке гасило всё
// приложение до белого экрана, и так продолжалось при каждом открытии, если
// причина лежала в памяти устройства (как было с памятью формы после перевода).
// Данные здесь не трогаем: сбрасываем только память формы, она не синхронизируется.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  function resetFormMemory() {
    try {
      window.localStorage.removeItem("finance-last-add-v1");
    } catch {
      // приватный режим — нечего сбрасывать
    }
    window.location.reload();
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-[20px] font-bold">Что-то пошло не так</div>
      <p className="text-[15px] text-label-2">
        Экран не смог открыться. Ваши операции и счета на месте, они хранятся
        отдельно и не пострадали.
      </p>
      {error?.message && (
        <p className="break-words text-[13px] text-label-3">{error.message}</p>
      )}
      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={reset}
          className="w-full rounded-2xl bg-brand py-3.5 text-[17px] font-semibold text-white"
        >
          Попробовать снова
        </button>
        <button
          type="button"
          onClick={resetFormMemory}
          className="w-full rounded-2xl bg-black/[0.06] py-3.5 text-[17px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200"
        >
          Сбросить память формы и перезагрузить
        </button>
      </div>
    </div>
  );
}
