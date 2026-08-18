"use client";

import { CellPopover } from "@/components/ui/cell-popover";
import { COLUMN_HELP, type ColumnCode } from "@/lib/public/column-help";

type ColumnHelpProps = {
  code: ColumnCode;
};

/**
 * Nagłówek kolumny z objaśnieniem skrótu.
 *
 * Całe zachowanie (klawiatura, dotyk, Escape, klik poza) mieszka we
 * wspólnym prymitywie CellPopover — tu zostaje wyłącznie treść.
 */
export function ColumnHelp({ code }: ColumnHelpProps) {
  const description = COLUMN_HELP[code];

  return (
    <CellPopover
      testId="column-help"
      align="below"
      label={`${code} — ${description}`}
      className="column-help-trigger"
      content={
        <>
          <span className="column-help-code">{code}</span>
          {description}
        </>
      }
    >
      {code}
    </CellPopover>
  );
}
