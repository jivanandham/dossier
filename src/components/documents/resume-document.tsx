import { Fragment, type CSSProperties, type ReactNode } from "react";

import { CitationText } from "@/components/citation";
import { PhotoPosition, PhotoShape, type PaperSize, type ThemeLayout } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { documentLabels } from "@/lib/document-labels";
import { documentLanguage } from "@/lib/document-language";
import type { ProfileData } from "@/lib/profile";
import { resumeContent, type ResumeContent, type ResumeOptions, type ResumeRole } from "@/lib/resume-content";
import { customKey, DEFAULT_SECTION_LAYOUT, inSidebar, sectionHeading, type SectionLayout, shownSections } from "@/lib/resume-sections";
import { skillLine } from "@/lib/skill-groups";
import { PHOTO_SHAPES, resolveTheme, type ResolvedTheme, type ThemeData } from "@/lib/themes";

import { Contact, ContactDetail, ContactLine, DocumentPage, DocumentSection, plainUnit, type UnitRenderer } from "./document-page";
import {
  IconAddressCard,
  IconBriefcase,
  IconCertificate,
  IconCogs,
  IconEnvelope,
  IconGithub,
  IconGraduationCap,
  IconIdCard,
  IconLanguage,
  IconLinkedin,
  IconMapMarker,
  IconPhone,
  IconUser,
} from "./latex-icons";
import styles from "./document.module.css";

type ResumeDocumentProps = ResumeOptions & {
  theme: ThemeData;
  profile: ProfileData;
  paper: PaperSize;
  /** Overrides the theme's layout, e.g. a tailored resume in a single column. */
  layout?: ThemeLayout;
  /** The sections' order and which are off (#297); without it, the order resumes have always had. */
  sections?: SectionLayout;
  /** The language it's written in (SET-7), for its headings too; without one, it's read from the text and the headings are English. */
  language?: string | null;
  /** Draws each tailored part; the preview's adds editing (E8-3). */
  renderUnit?: UnitRenderer;
  /** How far the spacing and type are squeezed to fit one page (public issue 69); 0 for the theme as it is. */
  fit?: number;
};

/** Enough of a resume's own words to tell its script and direction. */
const sampleText = (content: ResumeContent) =>
  [
    content.name,
    content.headline,
    content.summary,
    ...[...content.experience, ...content.volunteering].flatMap((role) => [role.role, ...role.bullets]),
    ...content.projects.flatMap((project) => [project.name, ...project.bullets]),
    ...content.customSections.flatMap((section) => section.items.flatMap((item) => [item.title, ...item.bullets])),
  ].join(" ");

/**
 * A resume (RES-1, RES-6, APP-4), the same markup for the preview and the
 * PDF. The base resume passes the profile alone; a tailored resume also
 * passes its units, which replace the profile's text.
 *
 * Sections without content are left out. Each tailored part is drawn by
 * `renderUnit` with its unit id, for editing it in place (E8-3).
 */
export function ResumeDocument({ theme, profile, paper, layout, sections = DEFAULT_SECTION_LAYOUT, language, renderUnit = plainUnit, fit = 0, ...options }: ResumeDocumentProps) {
  const resolved = resolveTheme(theme, layout, fit);
  const labels = documentLabels(language);
  const content = resumeContent(profile, options, labels);
  const { lang, dir } = documentLanguage(language, sampleText(content));

  if (resolved.isLatex) {
    return (
      <LatexResumeDocument
        resolved={resolved}
        content={content}
        paper={paper}
        lang={lang}
        dir={dir}
        renderUnit={renderUnit}
      />
    );
  }
  const { shape, position } = resolved.photo;
  const photo = (size: "header" | "sidebar", className?: string) =>
    content.photo && <ResumePhoto key="photo" src={content.photo} name={content.name} shape={shape} size={size} className={className} />;
  // A role, paid or volunteering (#294).
  const role = (entry: ResumeRole) => (
    <Fragment key={entry.id}>
      {renderUnit({
        id: `experience:${entry.id}`,
        className: styles.entry,
        head: <EntryHead title={entry.role} at={entry.company} dates={entry.dates} timeline={resolved.timeline} />,
        children: (
          <>
            {entry.descriptor && <p className={styles.descriptor}>{entry.descriptor}</p>}
            {entry.bullets.length > 0 && (
              <ul className={styles.bullets}>
                {entry.bullets.map((bullet, index) => (
                  <li key={index}>
                    <CitationText text={bullet} />
                  </li>
                ))}
              </ul>
            )}
            {entry.skills.length > 0 && (
              <p className={styles.entrySkills}>
                <span className={styles.accent}>{`${labels.skills} · `}</span>
                {entry.skills.join(", ")}
              </p>
            )}
          </>
        ),
      })}
    </Fragment>
  );

  // What the sidebar starts with, in a sidebar layout: these don't move.
  const sidebarTop = [
    position === PhotoPosition.SIDEBAR && photo("sidebar"),
    resolved.split && content.contacts.length > 0 && (
      <DocumentSection key="contact" title={labels.contact}>
        <ul className={styles.contactList}>
          {content.contacts.map((item, index) => (
            <li key={index}>
              <ContactDetail>{item}</ContactDetail>
            </li>
          ))}
        </ul>
      </DocumentSection>
    ),
  ].filter(Boolean);

  const drawn: Record<string, ReactNode> = {
    summary: content.summary && (
      <DocumentSection key="summary" title={sectionHeading(sections, "summary", labels.profile)}>
        {renderUnit({ id: "summary", children: <p className={styles.summary}>{content.summary}</p> })}
      </DocumentSection>
    ),
    experience: content.experience.length > 0 && (
      <DocumentSection key="experience" title={sectionHeading(sections, "experience", labels.experience)}>
        {content.experience.map(role)}
      </DocumentSection>
    ),
    volunteering: content.volunteering.length > 0 && (
      <DocumentSection key="volunteering" title={sectionHeading(sections, "volunteering", labels.volunteering)}>
        {content.volunteering.map(role)}
      </DocumentSection>
    ),
    projects: content.projects.length > 0 && (
      <DocumentSection key="projects" title={sectionHeading(sections, "projects", labels.projects)}>
        {content.projects.map((project) => (
          <Fragment key={project.id}>
            {renderUnit({
              id: `project:${project.id}`,
              className: styles.entry,
              head: (
                <EntryHead
                  title={project.name}
                  at={project.link && <DocumentLink link={project.link} href={project.href} />}
                  dates={project.dates}
                  timeline={resolved.timeline}
                />
              ),
              children: (
                <>
                  {project.bullets.length > 0 && (
                    <ul className={styles.bullets}>
                      {project.bullets.map((bullet, index) => (
                        <li key={index}>
                          <CitationText text={bullet} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {project.skills.length > 0 && (
                    <p className={styles.entrySkills}>
                      <span className={styles.accent}>{`${labels.skills} · `}</span>
                      {project.skills.join(", ")}
                    </p>
                  )}
                </>
              ),
            })}
          </Fragment>
        ))}
      </DocumentSection>
    ),
    education: content.education.length > 0 && (
      <DocumentSection key="education" title={sectionHeading(sections, "education", labels.education)}>
        {content.education.map((entry) => (
          <Fragment key={entry.id}>
            {renderUnit({
              id: `education:${entry.id}`,
              className: styles.entry,
              head: <EntryHead title={entry.degree} at={entry.school} dates={entry.dates} timeline={resolved.timeline} />,
              children: entry.notes && <p className={styles.muted}>{entry.notes}</p>,
            })}
          </Fragment>
        ))}
      </DocumentSection>
    ),
    certifications: content.certifications.length > 0 && (
      <DocumentSection key="certifications" title={sectionHeading(sections, "certifications", labels.certifications)}>
        {content.certifications.map((entry) => (
          <Fragment key={entry.id}>
            {renderUnit({
              id: `certification:${entry.id}`,
              className: styles.entry,
              head: <EntryHead title={entry.name} at={entry.issuer} dates={entry.date} timeline={resolved.timeline} />,
              children: (entry.details.length > 0 || entry.link) && (
                <p className={styles.muted}>
                  {[...entry.details, ...(entry.link ? [<DocumentLink key="link" link={entry.link} href={entry.href} />] : [])].map((part, index) => (
                    <Fragment key={index}>
                      {index > 0 && " · "}
                      {part}
                    </Fragment>
                  ))}
                </p>
              ),
            })}
          </Fragment>
        ))}
      </DocumentSection>
    ),
    publications: content.publications.length > 0 && (
      <DocumentSection key="publications" title={sectionHeading(sections, "publications", labels.publications)}>
        {content.publications.map((entry) => (
          <Fragment key={entry.id}>
            {renderUnit({
              id: `publication:${entry.id}`,
              className: styles.publication,
              children: (
                <p>
                  <CitationText text={entry.citation} />
                  {entry.link && (
                    <>
                      {" "}
                      <DocumentLink link={entry.link} href={entry.href} />
                    </>
                  )}
                </p>
              ),
            })}
          </Fragment>
        ))}
      </DocumentSection>
    ),
    references: content.references.length > 0 && (
      <DocumentSection key="references" title={sectionHeading(sections, "references", labels.references)}>
        <div className={styles.references}>
          {content.references.map((reference) => (
            <div key={reference.id}>
              <p className={styles.entryTitle}>{reference.name}</p>
              {reference.role && <p className={styles.muted}>{reference.role}</p>}
              {reference.contact && <p>{reference.contact}</p>}
            </div>
          ))}
        </div>
      </DocumentSection>
    ),
    skills: content.skills && (
      <DocumentSection key="skills" title={sectionHeading(sections, "skills", labels.skills)}>
        {renderUnit({ id: "skills", children: <SkillLines text={content.skills} /> })}
      </DocumentSection>
    ),
    languages: content.languages && (
      <DocumentSection key="languages" title={sectionHeading(sections, "languages", labels.languages)}>
        {renderUnit({ id: "languages", children: <p>{content.languages}</p> })}
      </DocumentSection>
    ),
  };

  for (const section of content.customSections) {
    const key = customKey(section.id);
    drawn[key] = (
      <DocumentSection key={key} title={sectionHeading(sections, key, section.title)}>
        <CustomSectionItems section={section} timeline={resolved.timeline} renderUnit={renderUnit} />
      </DocumentSection>
    );
  }

  const order = shownSections(sections, Object.keys(drawn).filter((key) => drawn[key]));
  const isSidebar = (key: string) => inSidebar(key, profile.customSections);
  const sidebar = [...sidebarTop, ...order.filter(isSidebar).map((key) => drawn[key])];
  const main = order.filter((key) => !isSidebar(key)).map((key) => drawn[key]);

  // Reading order matches what you see: the sidebar comes first in sidebar
  // layouts (and keeps its column even when empty) unless it's at the end of
  // the line. A single column simply follows the order.
  const columns = !resolved.split
    ? [[...sidebarTop, ...order.map((key) => drawn[key])]].filter((column) => column.length > 0)
    : resolved.sidebarEnd
      ? [main, sidebar]
      : [sidebar, main];
  // A tinted sidebar is drawn as a panel, unless there's nothing in it.
  const panel = resolved.tintedSidebar && sidebar.length > 0 ? sidebar : null;

  const title = (
    <>
      <h1 className={styles.name}>{content.name}</h1>
      {content.headline && <p className={styles.headline}>{content.headline}</p>}
      {!resolved.split && content.contacts.length > 0 && <ContactLine items={content.contacts} />}
    </>
  );
  // A photo beside the name puts the name, headline and contacts in a block of their own.
  const beside = content.photo && (position === PhotoPosition.HEADER_START || position === PhotoPosition.HEADER_END);

  return (
    <DocumentPage theme={resolved} paper={paper} lang={lang} dir={dir} label="Resume">
      <header className={cn(styles.header, beside && styles.headerWithPhoto)}>
        {position === PhotoPosition.ABOVE_NAME && photo("header", styles.photoAbove)}
        {position === PhotoPosition.HEADER_START && photo("header")}
        {beside ? <div className={styles.headerText}>{title}</div> : title}
        {position === PhotoPosition.HEADER_END && photo("header")}
      </header>
      <div className={styles.columns}>
        {columns.map((column, index) => (
          <div key={index} className={cn(styles.column, column === panel && styles.sidebarPanel)}>
            {column}
          </div>
        ))}
      </div>
    </DocumentPage>
  );
}

const SHAPE_CLASSES: Record<PhotoShape, string | undefined> = {
  [PhotoShape.CIRCLE]: styles.photoCircle,
  [PhotoShape.ROUNDED]: styles.photoRounded,
  [PhotoShape.SQUARE]: undefined,
  [PhotoShape.PORTRAIT]: undefined,
};

/** The profile photo (#224) in the theme's shape, at its size in the header or the sidebar. */
function ResumePhoto({ src, name, shape, size, className }: { src: string; name: string; shape: PhotoShape; size: "header" | "sidebar"; className?: string }) {
  const { width, height } = PHOTO_SHAPES[shape][size];
  return (
    // A data URL drawn as it is, in the preview and in the PDF: there's nothing for next/image to optimise.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className={cn(styles.photo, SHAPE_CLASSES[shape], className)}
      style={{ "--photo-width": width, "--photo-height": height } as CSSProperties}
    />
  );
}

/** "Sep 2015 – May 2018" that, in a narrow column, only wraps after the dash. */
const breakAfterDash = (dates: string) =>
  dates
    .split(" – ")
    .map((part) => part.replaceAll(" ", " "))
    .join(" – ");

/**
 * "Senior Product Designer, Northwind Logistics" with the dates at the end of
 * the line, or before it in a timeline column (the dates come first then, so
 * they float into the column next to the title).
 */
function EntryHead({ title, at, dates, timeline }: { title: string; at: ReactNode; dates: string; timeline: boolean }) {
  const datesSpan = dates && <span className={styles.dates}>{timeline ? breakAfterDash(dates) : dates}</span>;
  return (
    <div className={styles.entryHead}>
      {timeline && datesSpan}
      <p>
        <span className={styles.entryTitle}>{title}</span>
        {at && (
          <>
            {title && ", "}
            {at}
          </>
        )}
      </p>
      {!timeline && datesSpan}
    </div>
  );
}

/** A custom section's items in its format (#298). */
function CustomSectionItems({ section, timeline, renderUnit }: { section: ResumeContent["customSections"][number]; timeline: boolean; renderUnit: UnitRenderer }) {
  if (section.format === "INLINE") {
    return renderUnit({ id: `custom-inline:${section.id}`, children: <p>{section.items.map((item) => item.title).join(" · ")}</p> });
  }
  return section.items.map((item) => (
    <Fragment key={item.id}>
      {section.format === "LINES"
        ? renderUnit({
            id: `custom-line:${item.id}`,
            className: styles.publication,
            children: (
              <p>
                <CitationText text={item.title} />
                {item.link && (
                  <>
                    {" "}
                    <DocumentLink link={item.link} href={item.href} />
                  </>
                )}
              </p>
            ),
          })
        : renderUnit({
            id: `custom-entry:${item.id}`,
            className: styles.entry,
            head: <EntryHead title={item.title} at={item.subtitle} dates={item.dates} timeline={timeline} />,
            children: (
              <>
                {item.bullets.length > 0 && (
                  <ul className={styles.bullets}>
                    {item.bullets.map((bullet, index) => (
                      <li key={index}>{bullet}</li>
                    ))}
                  </ul>
                )}
                {item.link && (
                  <p className={styles.muted}>
                    <DocumentLink link={item.link} href={item.href} />
                  </p>
                )}
              </>
            ),
          })}
    </Fragment>
  ));
}

/** A publication's, certification's or custom item's link: clickable in the PDF when it's a web address. */
function DocumentLink({ link, href }: { link: string; href: string | null }) {
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={styles.link}>
      <Contact>{link}</Contact>
    </a>
  ) : (
    <span className={styles.link}>
      <Contact>{link}</Contact>
    </span>
  );
}

/** The Skills section: a line per group, led by the group's name (#280). */
function SkillLines({ text }: { text: string }) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const { label, text: skills } = skillLine(line);
      return (
        <p key={index} className={styles.skillLine}>
          {label && <strong className={styles.skillLabel}>{label}: </strong>}
          {skills}
        </p>
      );
    });
}

function parseLatexSkills(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const { label, text: itemsText } = skillLine(line);
      const groupName = label ?? "Skills";
      if (groupName === "LLM & Generative AI") {
        return {
          label: groupName,
          items: ["RAG, semantic re-ranking", "LangChain, ChromaDB", "LLM APIs", "Model evaluation"],
        };
      }
      if (groupName === "ML & Deep Learning") {
        return {
          label: groupName,
          items: [
            "PyTorch, TensorFlow",
            "Scikit-learn, NumPy, SciPy",
            "YOLOv8, RF-DETR",
            "Computer vision",
            "Predictive maintenance",
          ],
        };
      }
      if (groupName === "Data Engineering") {
        return {
          label: groupName,
          items: ["Python, SQL, Pandas", "Apache Airflow, ETL", "FastAPI, REST APIs, React.js"],
        };
      }
      if (groupName === "Industrial Automation") {
        return {
          label: groupName,
          items: ["SCADA, PLC, IoT"],
        };
      }
      if (groupName === "Cloud & MLOps") {
        return {
          label: groupName,
          items: ["AWS, Docker, GPU/CUDA", "Linux, Bash, Git, CI/CD"],
        };
      }
      const items = itemsText
        .split(" · ")
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        label: groupName,
        items,
      };
    });
}

function renderLatexRoleTitle(title: string): ReactNode {
  const match = title.match(/^(.*?)\s*(\(.*?\))$/);
  if (match) {
    return (
      <>
        <strong>{match[1]}</strong> <span className={styles.latexNormalWeight}>{match[2]}</span>
      </>
    );
  }
  return <strong>{title}</strong>;
}

function formatLatexBullet(bullet: string): ReactNode {
  if (bullet.includes("**")) {
    const parts = bullet.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }
  const metricRegex = /(15 channels|1,500 students|40 hrs\/week|90% precision|80% recall|90%|2,000\+ engineering hours|22%|\b10\b(?= engineers)|15%|10%|35%)/g;
  const parts = bullet.split(metricRegex);
  return parts.map((part, idx) => {
    if (metricRegex.test(part)) {
      return <strong key={idx}>{part}</strong>;
    }
    return part;
  });
}

/**
 * Dedicated XeLaTeX Blue theme layout: exactly replicates the user's
 * LaTeX template (main.tex) with full-page sidebar, right-column banner,
 * section rules, fontawesome icons, and strict single-page fit.
 */
function LatexResumeDocument({
  resolved,
  content,
  paper,
  lang,
  dir,
  renderUnit = plainUnit,
}: {
  resolved: ResolvedTheme;
  content: ResumeContent;
  paper: PaperSize;
  lang?: string;
  dir: "ltr" | "rtl";
  renderUnit: UnitRenderer;
}) {
  const skillGroups = content.skills ? parseLatexSkills(content.skills) : [];

  const languages = [
    { name: "English", level: "fluent" },
    { name: "French", level: "A2, improving" },
    { name: "Tamil", level: "native" },
  ];

  return (
    <DocumentPage theme={resolved} paper={paper} lang={lang} dir={dir} label="Resume" className={styles.latexPage}>
      {/* ============= LEFT SIDEBAR ============= */}
      <aside className={styles.latexSidebar}>
        {content.photo && (
          <div className={styles.latexPhotoWrapper}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={content.photo} alt={content.name} className={styles.latexPhoto} />
          </div>
        )}

        {/* Contact */}
        <section className={styles.latexSideSection}>
          <div className={styles.latexSideHeading}>
            <IconAddressCard className={styles.latexSideIcon} />
            <span>Contact</span>
          </div>
          <div className={styles.latexSideRule} />
          <ul className={styles.latexContactList}>
            <li className={styles.latexContactItem}>
              <IconPhone className={styles.latexContactIcon} />
              <span>+33 7 44 29 08 23</span>
            </li>
            <li className={styles.latexContactItem}>
              <IconEnvelope className={styles.latexContactIcon} />
              <a href="mailto:jivanandham@gmail.com">jivanandham@gmail.com</a>
            </li>
            <li className={styles.latexContactItem}>
              <IconMapMarker className={styles.latexContactIcon} />
              <span>Poitiers, France</span>
            </li>
            <li className={styles.latexContactItem}>
              <IconLinkedin className={styles.latexContactIcon} />
              <a href="https://linkedin.com/in/jivanandham" target="_blank" rel="noreferrer">
                linkedin.com/in/jivanandham
              </a>
            </li>
            <li className={styles.latexContactItem}>
              <IconGithub className={styles.latexContactIcon} />
              <a href="https://github.com/jivanandham" target="_blank" rel="noreferrer">
                github.com/jivanandham
              </a>
            </li>
            <li className={styles.latexContactItem}>
              <IconIdCard className={styles.latexContactIcon} />
              <span>Talent Passport (no sponsorship)</span>
            </li>
          </ul>
        </section>

        {/* Skills */}
        {skillGroups.length > 0 && (
          <section className={styles.latexSideSection}>
            <div className={styles.latexSideHeading}>
              <IconCogs className={styles.latexSideIcon} />
              <span>Skills</span>
            </div>
            <div className={styles.latexSideRule} />
            {renderUnit({
              id: "skills",
              children: (
                <div className={styles.latexSkillGroups}>
                  {skillGroups.map((group, idx) => (
                    <div key={idx} className={styles.latexSkillGroup}>
                      <div className={styles.latexSkillGroupName}>{group.label}</div>
                      <ul className={styles.latexSkillItems}>
                        {group.items.map((item, itemIdx) => (
                          <li key={itemIdx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ),
            })}
          </section>
        )}

        {/* Languages */}
        {languages.length > 0 && (
          <section className={styles.latexSideSection}>
            <div className={styles.latexSideHeading}>
              <IconLanguage className={styles.latexSideIcon} />
              <span>Languages</span>
            </div>
            <div className={styles.latexSideRule} />
            {renderUnit({
              id: "languages",
              children: (
                <div className={styles.latexLanguages}>
                  {languages.map((langItem, idx) => (
                    <div key={idx}>
                      <strong>{langItem.name}</strong>: {langItem.level}
                    </div>
                  ))}
                </div>
              ),
            })}
          </section>
        )}

        {/* Certification */}
        {content.certifications && content.certifications.length > 0 ? (
          <section className={styles.latexSideSection}>
            <div className={styles.latexSideHeading}>
              <IconCertificate className={styles.latexSideIcon} />
              <span>Certification</span>
            </div>
            <div className={styles.latexSideRule} />
            {content.certifications.map((cert) => {
              const dateStr = (cert as any).date ?? (cert as any).dates ?? "";
              const cleanDates = dateStr
                ? dateStr.includes(" – ") && dateStr.split(" – ")[0] === dateStr.split(" – ")[1]
                  ? dateStr.split(" – ")[0]
                  : dateStr
                : "";
              return (
                <div key={cert.id} className={styles.latexCert}>
                  <div className={styles.latexCertName}>{cert.name}</div>
                  <div className={styles.latexCertIssuer}>
                    {[cert.issuer, cleanDates].filter(Boolean).join(", ")}
                  </div>
                </div>
              );
            })}
          </section>
        ) : null}
      </aside>

      {/* ============= MAIN COLUMN ============= */}
      <main className={styles.latexMain}>
        {/* Banner */}
        <header className={styles.latexBanner}>
          <h1 className={styles.latexName}>{content.name}</h1>
          <div className={styles.latexHeadline}>{content.headline}</div>
          <div className={styles.latexTagline}>French Talent Passport (no sponsorship required) • Available immediately</div>
        </header>

        {/* Main Content */}
        <div className={styles.latexMainBody}>
          {/* Professional Summary */}
          {content.summary && (
            <section className={styles.latexMainSection}>
              <div className={styles.latexMainHeading}>
                <IconUser className={styles.latexMainIcon} />
                <span>Professional Summary</span>
              </div>
              <div className={styles.latexMainRule} />
              {renderUnit({
                id: "summary",
                children: <p className={styles.latexSummary}>{content.summary}</p>,
              })}
            </section>
          )}

          {/* Professional Experience */}
          {content.experience.length > 0 && (
            <section className={styles.latexMainSection}>
              <div className={styles.latexMainHeading}>
                <IconBriefcase className={styles.latexMainIcon} />
                <span>Professional Experience</span>
              </div>
              <div className={styles.latexMainRule} />
              <div className={styles.latexRoles}>
                {content.experience.map((role) => (
                  <div key={role.id} className={styles.latexRole}>
                    {renderUnit({
                      id: `experience:${role.id}`,
                      children: (
                        <>
                          <div className={styles.latexRoleHead}>
                            <div className={styles.latexRoleTitle}>{renderLatexRoleTitle(role.role)}</div>
                            <div className={styles.latexRoleSub}>
                              <span className={styles.latexRoleCompany}>{role.company}</span>
                              <span className={styles.latexRoleDates}>{role.dates}</span>
                            </div>
                          </div>
                          {role.bullets.length > 0 && (
                            <ul className={styles.latexBullets}>
                              {role.bullets.map((bullet, i) => (
                                <li key={i}>{formatLatexBullet(bullet)}</li>
                              ))}
                            </ul>
                          )}
                        </>
                      ),
                    })}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Education */}
          {content.education.length > 0 && (
            <section className={styles.latexMainSection}>
              <div className={styles.latexMainHeading}>
                <IconGraduationCap className={styles.latexMainIcon} />
                <span>Education</span>
              </div>
              <div className={styles.latexMainRule} />
              <div className={styles.latexEducation}>
                {content.education.map((edu) => (
                  <div key={edu.id} className={styles.latexEduEntry}>
                    {renderUnit({
                      id: `education:${edu.id}`,
                      children: (
                        <>
                          <div className={styles.latexRoleTitle}>{edu.degree}</div>
                          <div className={styles.latexRoleSub}>
                            <span className={styles.latexRoleCompany}>{edu.school}</span>
                            <span className={styles.latexRoleDates}>{edu.dates}</span>
                          </div>
                          {edu.notes && (
                            <div className={styles.latexEduNotes}>
                              {edu.notes} —{" "}
                              <a
                                href="https://github.com/jivanandham/Cyber-Forensics-Deepfake-Detection"
                                target="_blank"
                                rel="noreferrer"
                                className={styles.latexLink}
                              >
                                <IconGithub className={styles.latexInlineIcon} /> GitHub
                              </a>
                            </div>
                          )}
                        </>
                      ),
                    })}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </DocumentPage>
  );
}
