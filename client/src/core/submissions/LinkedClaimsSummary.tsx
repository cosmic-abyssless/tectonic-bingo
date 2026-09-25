import { Fragment } from "react";
import type { Claim } from "@bingo/shared";
import { WikiItemLink } from "../ui/WikiItemLink";

/** claimsSummary() with each item linked to its wiki page: "2× Bruma torch, Vorki". */
export function LinkedClaimsSummary({ claims }: { claims: Claim[] }) {
  const items = claims.filter((c) => c.itemName !== null);
  if (items.length === 0) return <>(no items claimed — judged manually)</>;
  return (
    <>
      {items.map((c, i) => (
        <Fragment key={c.id}>
          {i > 0 && ", "}
          {c.quantity > 1 && `${c.quantity}× `}
          <WikiItemLink name={c.itemName!} />
        </Fragment>
      ))}
    </>
  );
}
