"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave } from "@/hooks/use-autosave";
import { formatDateRange, type CertificationItem, type ProfileData } from "@/lib/profile";

import {
  createCertification,
  removeCertification,
  restoreCertification,
  saveCertification,
} from "./actions";
import { EntryList } from "./entry-list";
import { MonthYearField } from "./month-year-field";
import { useTrackSave } from "@/components/save-tracker";
import type { UpdateProfile } from "./skills-section";

function CertificationForm({
  entry,
  onChange,
  autoFocus,
}: {
  entry: CertificationItem;
  onChange: (entry: CertificationItem) => void;
  autoFocus: boolean;
}) {
  const track = useTrackSave();
  const { flush } = useAutosave(entry, (value) => track(saveCertification(value)));
  const set = (change: Partial<CertificationItem>) => onChange({ ...entry, ...change });

  return (
    <div className="grid grid-cols-2 gap-[18px]" onBlur={flush}>
      <Input
        className="col-span-2"
        label="Certification name"
        placeholder="AWS Certified Solutions Architect"
        value={entry.name}
        onChange={(event) => set({ name: event.target.value })}
        autoFocus={autoFocus}
      />
      <Input
        className="col-span-2"
        label="Issuing organization"
        placeholder="Amazon Web Services"
        value={entry.issuer}
        onChange={(event) => set({ issuer: event.target.value })}
      />
      <MonthYearField
        label="Issued date"
        value={{ month: entry.startMonth, year: entry.startYear }}
        onChange={({ month, year }) => set({ startMonth: month, startYear: year })}
      />
      <MonthYearField
        label="Expiration date (if any)"
        value={{ month: entry.endMonth, year: entry.endYear }}
        onChange={({ month, year }) => set({ endMonth: month, endYear: year })}
      />
      <Textarea
        className="col-span-2"
        label="Credential ID or notes"
        placeholder="Credential ID, score, or skills covered"
        rows={3}
        value={entry.notes}
        onChange={(event) => set({ notes: event.target.value })}
      />
    </div>
  );
}

/** Certifications section: professional credentials and licenses. */
export function CertificationsSection({
  profile,
  update,
}: {
  profile: ProfileData;
  update: UpdateProfile;
}) {
  const items = profile.certifications ?? [];

  return (
    <EntryList
      items={items}
      setItems={(change) =>
        update((current) => ({
          ...current,
          certifications: change(current.certifications ?? []),
        }))
      }
      addLabel="Add certification"
      summary={(entry) => ({
        title: entry.name.trim() || "New certification",
        subtitle: entry.issuer.trim(),
        meta: formatDateRange(entry),
      })}
      create={() => createCertification({})}
      remove={(entry) => removeCertification({ id: entry.id })}
      restore={(entry) => restoreCertification(entry)}
      renderForm={(entry, { onChange, autoFocus }) => (
        <CertificationForm entry={entry} onChange={onChange} autoFocus={autoFocus} />
      )}
    />
  );
}

