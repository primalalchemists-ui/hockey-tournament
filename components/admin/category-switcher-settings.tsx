"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  connectTournamentsAction,
  moveCategoryAction,
  removeCategoryAction,
  updateCategoryAction,
  type TournamentActionState,
} from "@/app/admin/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ColorPicker } from "@/components/admin/color-picker";
import { CategoryBubblePreview } from "@/components/admin/color-previews";
import type { CollectionMember } from "@/lib/data/postgres/collections";
import {
  DEFAULT_BUBBLE_COLOR,
  MAX_CATEGORY_LABEL,
  describeLabelError,
  suggestCategoryLabel,
} from "@/lib/public/tournament-collection";

/**
 * PRZELACZNIK KATEGORII — konfiguracja w panelu.
 *
 * Laczy technicznie osobne turnieje w jedno wydarzenie: kazdy zachowuje
 * wlasne druzyny, mecze i faze, a kibic moze przechodzic miedzy nimi.
 *
 * CALE dodawanie i edycja dzieje sie INLINE. Zakladka „Kategorie" jest
 * dedykowanym miejscem pracy, wiec okno modalne bylo tu tylko przeszkoda:
 * na telefonie ciagnelo sie przez caly ekran, a przyciski uciekaly poza
 * zasieg. Okno zostalo wylacznie przy usuwaniu, bo to operacja niszczaca.
 *
 * ZADNA operacja w tej sekcji nie zmienia turnieju wyswietlanego publicznie.
 */

const initialState: TournamentActionState = { error: null };

type CategorySettingsProps = {
  tournamentId: string;
  title: string;
  members: CollectionMember[];
  /** Turnieje, ktore mozna jeszcze dolaczyc do wydarzenia. */
  connectable: Array<{ id: string; title: string }>;
};

/** Przycisk wysylajacy formularz — stan oczekiwania bierze z formularza. */
function SubmitButton({
  label,
  busyLabel,
  disabled,
  className = "btn btn-primary h-10 min-w-[9rem] justify-center text-sm",
}: {
  label: string;
  busyLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending || disabled} className={className}>
      {pending ? busyLabel : label}
    </button>
  );
}

export function CategorySwitcherSettings({
  tournamentId,
  title,
  members,
  connectable,
}: CategorySettingsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CollectionMember | null>(
    null
  );

  const [connectState, connect] = useActionState(
    connectTournamentsAction,
    initialState
  );
  const [removeState, remove, isRemoving] = useActionState(
    removeCategoryAction,
    initialState
  );

  const removeFormRef = useRef<HTMLFormElement | null>(null);

  /*
    Panel dodawania zamyka sie DOPIERO wtedy, gdy serwer potwierdzi zmiane —
    czyli gdy z propsow przyjdzie nowa liczba czlonkow. Zadnego zamykania
    „na wyrost" ani sztucznego opoznienia.
  */
  const [seenCount, setSeenCount] = useState(members.length);

  if (members.length !== seenCount) {
    setSeenCount(members.length);
    if (isAdding) setIsAdding(false);
  }

  return (
    <section className="ice-surface flush-card space-y-4 p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Przełącznik kategorii
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Połącz turnieje należące do jednego wydarzenia.
        </p>
      </div>

      {removeState.error ? (
        <p
          data-testid="category-settings-error"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
        >
          {removeState.error}
        </p>
      ) : null}

      {members.length === 0 ? (
        <p className="text-sm text-slate-600">
          Ten turniej nie jest połączony z innymi kategoriami.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {members.length}{" "}
            {members.length === 1 ? "kategoria" : "kategorie"}
          </p>

          <ul className="space-y-3">
            {members.map((member, index) => (
              <MemberCard
                key={member.tournamentId}
                member={member}
                isFirst={index === 0}
                isLast={index === members.length - 1}
                onRemove={() => setRemoveTarget(member)}
              />
            ))}
          </ul>
        </>
      )}

      {isAdding ? (
        <AddMemberPanel
          tournamentId={tournamentId}
          title={title}
          connectable={connectable}
          isFirstConnection={members.length === 0}
          error={connectState.error}
          action={connect}
          onCancel={() => setIsAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          data-testid="category-add-open"
          className="btn btn-quiet h-10 text-sm"
        >
          + Dodaj turniej
        </button>
      )}

      {/*
        Jedyne okno, jakie tu zostalo: usuniecie z wydarzenia jest operacja
        niszczaca relacje. Formularz jest ukryty i wysylany przez
        `requestSubmit`, wiec akcja leci prawdziwym submitem.
      */}
      <ConfirmDialog
        open={removeTarget !== null}
        tone="danger"
        title="Usunąć turniej z przełącznika kategorii?"
        confirmLabel="Usuń z wydarzenia"
        busyLabel="Usuwanie…"
        isBusy={isRemoving}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          setRemoveTarget(null);
          removeFormRef.current?.requestSubmit();
        }}
      >
        <p>
          Turniej{" "}
          <span className="font-semibold text-slate-900">
            {removeTarget?.title}
          </span>{" "}
          pozostanie w systemie razem ze wszystkimi wynikami.
        </p>
        <p>Zniknie tylko możliwość przełączania do niego z tego wydarzenia.</p>
      </ConfirmDialog>

      <form ref={removeFormRef} action={remove} className="hidden">
        <input
          type="hidden"
          name="tournamentId"
          value={removeTarget?.tournamentId ?? ""}
        />
      </form>
    </section>
  );
}

/**
 * INLINE PANEL DODAWANIA.
 *
 * Przy PIERWSZYM polaczeniu ustawiamy tez etykiete i kolor turnieju,
 * w ktorym stoimy — bez tego przelacznik nie mialby jak go nazwac.
 * Przy kolejnych kategoriach formularz jest juz jednoczlonowy.
 */
function AddMemberPanel({
  tournamentId,
  title,
  connectable,
  isFirstConnection,
  error,
  action,
  onCancel,
}: {
  tournamentId: string;
  title: string;
  connectable: Array<{ id: string; title: string }>;
  isFirstConnection: boolean;
  error: string | null;
  action: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [targetId, setTargetId] = useState(connectable[0]?.id ?? "");
  const [targetLabel, setTargetLabel] = useState(
    suggestCategoryLabel(connectable[0]?.title ?? "")
  );
  const [targetColor, setTargetColor] = useState(DEFAULT_BUBBLE_COLOR);

  const [currentLabel, setCurrentLabel] = useState(suggestCategoryLabel(title));
  const [currentColor, setCurrentColor] = useState(DEFAULT_BUBBLE_COLOR);

  if (connectable.length === 0) {
    /*
      Komunikat pokazuje sie DOPIERO po otwarciu panelu. Domyslny stan sekcji
      nie ma prawa straszyc ograniczeniami, ktore moga nigdy nie wystapic.
    */
    return (
      <div
        data-testid="category-add-panel"
        className="space-y-3 rounded-2xl border border-slate-200 p-4"
      >
        <p className="text-sm text-slate-600">
          Brak dostępnych turniejów do dodania.
        </p>
        <p className="text-xs text-slate-500">
          Turniej może należeć tylko do jednego wydarzenia, a zarchiwizowane
          nie biorą udziału w przełączniku.
        </p>

        <button
          type="button"
          onClick={onCancel}
          className="btn btn-quiet h-10 text-sm"
        >
          Anuluj
        </button>
      </div>
    );
  }

  const targetLabelError = describeLabelError(targetLabel);
  const currentLabelError = isFirstConnection
    ? describeLabelError(currentLabel)
    : null;

  const sameLabel =
    isFirstConnection && currentLabel.trim() === targetLabel.trim();

  const invalid =
    !targetId ||
    targetLabelError !== null ||
    currentLabelError !== null ||
    sameLabel;

  return (
    /*
      Zwykly formularz z akcja serwerowa. To jest wlasciwa semantyka Reacta:
      wczesniej akcja `useActionState` byla wolana recznie z obslugi klikniecia
      okna modalnego, poza transition — stad blad „An async function with
      useActionState was called outside of a transition".
    */
    <form
      action={action}
      data-testid="category-add-panel"
      className="space-y-4 rounded-2xl border border-slate-200 p-4"
    >
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="targetColor" value={targetColor} />

      {isFirstConnection ? (
        <>
          <input type="hidden" name="currentColor" value={currentColor} />

          <div className="space-y-2">
            <p className="section-eyebrow">Obecny turniej</p>
            <p className="truncate text-sm font-semibold text-slate-900">
              {title}
            </p>

            <LabelField
              name="currentLabel"
              value={currentLabel}
              onChange={setCurrentLabel}
              error={currentLabelError}
              testId="add-current-label"
            />

            <ColorField
              color={currentColor}
              label={currentLabel}
              onChange={setCurrentColor}
            />
          </div>

          <hr className="border-[var(--surface-line)]" />
        </>
      ) : null}

      <div className="space-y-2">
        <p className="section-eyebrow">
          {isFirstConnection ? "Dodawany turniej" : "Nowa kategoria"}
        </p>

        <label
          htmlFor="category-target"
          className="text-sm font-semibold text-slate-700"
        >
          Wybierz turniej
        </label>

        <select
          id="category-target"
          name="targetTournamentId"
          value={targetId}
          onChange={(event) => {
            setTargetId(event.target.value);

            const next = connectable.find(
              (item) => item.id === event.target.value
            );

            if (next) setTargetLabel(suggestCategoryLabel(next.title));
          }}
          data-testid="category-target-select"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
        >
          {connectable.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>

        <LabelField
          name="targetLabel"
          value={targetLabel}
          onChange={setTargetLabel}
          error={targetLabelError}
          testId="category-target-label"
        />

        <ColorField
          color={targetColor}
          label={targetLabel}
          onChange={setTargetColor}
        />
      </div>

      {sameLabel ? (
        <p className="text-xs font-medium text-rose-700">
          Etykiety muszą się różnić — przełącznik musi być jednoznaczny.
        </p>
      ) : null}

      {error ? (
        <p
          data-testid="category-add-error"
          className="text-xs font-medium text-rose-700"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <SubmitButton
          label={isFirstConnection ? "Połącz turnieje" : "Dodaj"}
          busyLabel="Dodawanie…"
          disabled={invalid}
        />

        <button
          type="button"
          onClick={onCancel}
          className="btn btn-quiet h-10 text-sm"
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}

/** Pole etykiety razem z komunikatem tuż pod nim. */
function LabelField({
  name,
  value,
  onChange,
  error,
  testId,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-slate-700">Etykieta</label>

      <input
        name={name}
        value={value}
        maxLength={MAX_CATEGORY_LABEL}
        onChange={(event) => onChange(event.target.value)}
        placeholder="np. U10"
        data-testid={testId}
        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
      />

      {error ? (
        <p className="text-xs font-medium text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}

/**
 * Kolor w postaci zwiniętej.
 *
 * Wszystko dzieje się teraz na stronie, więc otwarty na stałe picker
 * rozdmuchałby każdą kartę do kilkuset pikseli wysokości. Domyślnie widać
 * próbkę i wartość; pełna kontrolka rozwija się na żądanie.
 */
function ColorField({
  color,
  label,
  onChange,
}: {
  color: string;
  label: string;
  onChange: (hex: string) => void;
}) {
  return (
    <details className="rounded-2xl border border-slate-200 px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
        <span className="flex-1">Kolor</span>

        <CategoryBubblePreview label={label} color={color} />
      </summary>

      <div className="mt-3">
        <ColorPicker value={color} onChange={onChange} />
      </div>
    </details>
  );
}

/**
 * Karta istniejacej kategorii.
 *
 * Edycja etykiety i koloru dzieje sie na miejscu — bez okna, bez
 * przeladowania. Zapis to zwykly formularz z akcja serwerowa.
 */
function MemberCard({
  member,
  isFirst,
  isLast,
  onRemove,
}: {
  member: CollectionMember;
  isFirst: boolean;
  isLast: boolean;
  onRemove: () => void;
}) {
  const [label, setLabel] = useState(member.label);
  const [color, setColor] = useState(member.bubbleColor);

  const [saveState, save] = useActionState(updateCategoryAction, initialState);
  const [, move] = useActionState(moveCategoryAction, initialState);

  const labelError = describeLabelError(label);

  return (
    <li
      data-testid="category-member"
      className="space-y-3 rounded-2xl border border-slate-200 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {member.title}
          </p>

          {member.isCurrent ? (
            <span className="text-xs font-medium text-emerald-700">
              Aktualnie wyświetlany
            </span>
          ) : null}

          {member.isArchived ? (
            <span className="text-xs font-medium text-amber-700">
              Zarchiwizowany — ukryty w przełączniku
            </span>
          ) : null}
        </div>

        {/* Kolejnosc to drugoplanowa akcja — male, ciche przyciski. */}
        <div className="flex items-center gap-1.5">
          <form action={move}>
            <input
              type="hidden"
              name="tournamentId"
              value={member.tournamentId}
            />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              disabled={isFirst}
              aria-label="Przesuń wyżej"
              className="btn btn-quiet h-8 w-8 justify-center p-0 text-xs"
            >
              {"\u2191"}
            </button>
          </form>

          <form action={move}>
            <input
              type="hidden"
              name="tournamentId"
              value={member.tournamentId}
            />
            <input type="hidden" name="direction" value="down" />
            <button
              type="submit"
              disabled={isLast}
              aria-label="Przesuń niżej"
              className="btn btn-quiet h-8 w-8 justify-center p-0 text-xs"
            >
              {"\u2193"}
            </button>
          </form>
        </div>
      </div>

      <form action={save} className="space-y-3">
        <input type="hidden" name="tournamentId" value={member.tournamentId} />
        <input type="hidden" name="bubbleColor" value={color} />

        <div className="grid gap-3 sm:grid-cols-2">
          <LabelField
            name="label"
            value={label}
            onChange={setLabel}
            error={labelError}
            testId="category-label-input"
          />

          <ColorField color={color} label={label} onChange={setColor} />
        </div>

        <div className="flex flex-wrap gap-2">
          <SubmitButton
            label="Zapisz ustawienia"
            busyLabel="Zapisywanie…"
            disabled={labelError !== null}
          />

          <button
            type="button"
            onClick={onRemove}
            data-testid="category-remove"
            className="btn btn-quiet h-10 text-sm"
          >
            Usuń z wydarzenia
          </button>
        </div>

        {saveState.error ? (
          <p
            data-testid="category-save-error"
            className="text-xs font-medium text-rose-700"
          >
            {saveState.error}
          </p>
        ) : null}
      </form>
    </li>
  );
}
