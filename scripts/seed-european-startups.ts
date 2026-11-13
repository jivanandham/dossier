import { createPrismaClient } from "../src/lib/database";
import { placeOf } from "../src/lib/startups/place";
import { matchStartup, MATCH_VERSION } from "../src/lib/startups/match";
import type { FoundStartup } from "../src/lib/startups/types";

const STARTUPS: FoundStartup[] = [
  {
    source: "EU",
    externalId: "mistral-ai",
    company: "Mistral AI",
    website: "https://mistral.ai",
    summary: "Frontier AI and open-weight LLMs (Mistral Large, Pixtral, Codestral, Le Chat)",
    details: "Mistral AI is a Paris-based AI company building state-of-the-art open-source and commercial generative AI models. Developing decentralized, private, and sovereign AI infrastructure across Europe.\nOpen roles: AI Research Scientist, Distributed Systems Engineer, Full Stack Engineer, LLM Post-Training Specialist, High Performance Computing Engineer.\nApply via careers portal or email jobs@mistral.ai.",
    location: "Paris, France · Remote Europe",
    remote: true,
    stage: "Series B · Frontier AI",
    roles: [
      "AI Research Scientist",
      "Distributed Systems Engineer",
      "Full Stack Engineer",
      "LLM Evaluation Engineer",
      "Solutions Architect",
    ],
    emails: [
      { email: "jobs@mistral.ai", label: "Hiring", from: "https://mistral.ai/careers", onRequest: false, foundAt: new Date().toISOString() },
    ],
    links: [
      { label: "Careers & Jobs", url: "https://jobs.lever.co/mistral" },
      { label: "Website", url: "https://mistral.ai" },
    ],
    postedAt: new Date().toISOString(),
  },
  {
    source: "EU",
    externalId: "qonto",
    company: "Qonto",
    website: "https://qonto.com",
    summary: "Leading European business finance solution and fintech unicorn for SMEs and freelancers",
    details: "Qonto simplifies banking, bookkeeping, and spend management for over 500,000 European companies. Backed by Valar, Tencent, and KKR.\nOpen roles: Senior Backend Engineer (Go/Ruby), Staff Frontend Engineer (React/TypeScript), Mobile Engineer (Kotlin/Swift), Product Designer, Security Engineer.\nApply at careers portal or write to careers@qonto.com.",
    location: "Paris, France · Remote Europe",
    remote: true,
    stage: "Unicorn · Series D",
    roles: [
      "Senior Backend Engineer",
      "Staff Frontend Engineer",
      "Mobile Engineer (Android/iOS)",
      "Product Designer",
      "Security Engineer",
    ],
    emails: [
      { email: "careers@qonto.com", label: "Hiring", from: "https://qonto.com/en/careers", onRequest: false, foundAt: new Date().toISOString() },
    ],
    links: [
      { label: "Careers & Jobs", url: "https://qonto.com/en/careers" },
      { label: "Website", url: "https://qonto.com" },
    ],
    postedAt: new Date().toISOString(),
  },
  {
    source: "EU",
    externalId: "doctolib",
    company: "Doctolib",
    website: "https://www.doctolib.fr",
    summary: "E-health and digital healthcare platform connecting 70M+ patients with medical providers",
    details: "Doctolib is improving European healthcare by building next-generation digital consultation, appointment scheduling, and patient management software.\nOpen roles: Fullstack Developer (Ruby on Rails / React), Site Reliability Engineer (AWS/Kubernetes), Engineering Manager, Data Analyst, Product Manager.\nApply via careers portal or jobs@doctolib.com.",
    location: "Paris, Nantes, France · Remote Europe",
    remote: true,
    stage: "Unicorn · Next40",
    roles: [
      "Fullstack Developer (Rails/React)",
      "Site Reliability Engineer",
      "Engineering Manager",
      "Data Analyst",
      "Product Manager",
    ],
    emails: [
      { email: "jobs@doctolib.com", label: "Hiring", from: "https://careers.doctolib.com", onRequest: false, foundAt: new Date().toISOString() },
    ],
    links: [
      { label: "Careers & Jobs", url: "https://careers.doctolib.com" },
      { label: "Website", url: "https://www.doctolib.fr" },
    ],
    postedAt: new Date().toISOString(),
  },
  {
    source: "EU",
    externalId: "back-market",
    company: "Back Market",
    website: "https://www.backmarket.com",
    summary: "Global circular-economy marketplace dedicated to certified refurbished tech and electronics",
    details: "Back Market is the leading marketplace for high-quality refurbished smartphones, laptops, and appliances, fighting electronic waste worldwide.\nOpen roles: Senior Backend Engineer (Python/Django), Frontend Engineer (Vue/Nuxt), Cloud Platform Engineer, Data Platform Architect.\nApply via careers portal or jobs@backmarket.com.",
    location: "Paris, Bordeaux, France · Remote Europe",
    remote: true,
    stage: "Unicorn · Next40",
    roles: [
      "Senior Backend Engineer (Python)",
      "Frontend Engineer (Vue.js)",
      "Cloud Platform Engineer",
      "Data Platform Architect",
    ],
    emails: [
      { email: "jobs@backmarket.com", label: "Hiring", from: "https://careers.backmarket.com", onRequest: false, foundAt: new Date().toISOString() },
    ],
    links: [
      { label: "Careers & Jobs", url: "https://careers.backmarket.com" },
      { label: "Website", url: "https://www.backmarket.com" },
    ],
    postedAt: new Date().toISOString(),
  },
  {
    source: "EU",
    externalId: "pasqal",
    company: "Pasqal",
    website: "https://pasqal.com",
    summary: "Pioneer in neutral-atom quantum computing, quantum algorithms, and cloud QPU systems",
    details: "Pasqal builds 1000+ qubit neutral-atom quantum processors for simulation, quantum machine learning, and combinatorial optimization.\nOpen roles: Quantum Software Developer, Quantum Applications Scientist, Scientific Software Engineer (Python/C++), Quantum Hardware Architect.\nApply via careers portal or careers@pasqal.com.",
    location: "Massy, Paris, France · Remote Europe",
    remote: true,
    stage: "Series B · DeepTech",
    roles: [
      "Quantum Software Developer",
      "Quantum Applications Scientist",
      "Scientific Software Engineer",
      "Quantum Hardware Architect",
    ],
    emails: [
      { email: "careers@pasqal.com", label: "Hiring", from: "https://pasqal.com/careers", onRequest: false, foundAt: new Date().toISOString() },
    ],
    links: [
      { label: "Careers & Jobs", url: "https://pasqal.com/careers" },
      { label: "Website", url: "https://pasqal.com" },
    ],
    postedAt: new Date().toISOString(),
  },
  {
    source: "EU",
    externalId: "alice-bob",
    company: "Alice & Bob",
    website: "https://alice-bob.com",
    summary: "Fault-tolerant quantum computing using superconducting cat qubits with self-correcting bit-flips",
    details: "Alice & Bob develops the first universal fault-tolerant quantum computer using cat qubits to exponentially reduce hardware overhead.\nOpen roles: Quantum Control Engineer, Microwave and Cryogenics Physicist, Quantum Compiler Engineer, FPGA Developer.\nApply via careers portal or jobs@alice-bob.com.",
    location: "Paris, France · Hybrid",
    remote: true,
    stage: "Series A · DeepTech",
    roles: [
      "Quantum Control Engineer",
      "Microwave & Cryogenics Physicist",
      "Quantum Compiler Engineer",
      "FPGA Developer",
    ],
    emails: [
      { email: "jobs@alice-bob.com", label: "Hiring", from: "https://alice-bob.com/careers", onRequest: false, foundAt: new Date().toISOString() },
    ],
    links: [
      { label: "Careers & Jobs", url: "https://alice-bob.com/careers" },
      { label: "Website", url: "https://alice-bob.com" },
    ],
    postedAt: new Date().toISOString(),
  },
  {
    source: "EU",
    externalId: "exotec",
    company: "Exotec",
    website: "https://www.exotec.com",
    summary: "Industrial warehouse robotics pioneer building the Skypod autonomous fleet system",
    details: "Exotec designs and manufactures high-density goods-to-person robotic automation systems deployed by global retailers including Carrefour, Decathlon, and Uniqlo.\nOpen roles: Robotic Software Engineer (C++/ROS), Embedded Systems Developer, Cloud Fleet Architect, Automation Integration Engineer.\nApply via careers portal or recrutement@exotec.com.",
    location: "Croix, Lille, Paris, France · Remote Europe",
    remote: true,
    stage: "Unicorn · Next40",
    roles: [
      "Robotic Software Engineer (C++)",
      "Embedded Systems Developer",
      "Cloud Fleet Architect",
      "Automation Integration Engineer",
    ],
    emails: [
      { email: "recrutement@exotec.com", label: "Hiring", from: "https://www.exotec.com/careers", onRequest: false, foundAt: new Date().toISOString() },
    ],
    links: [
      { label: "Careers & Jobs", url: "https://www.exotec.com/careers" },
      { label: "Website", url: "https://www.exotec.com" },
    ],
    postedAt: new Date().toISOString(),
  },
  {
    source: "EU",
    externalId: "verkor",
    company: "Verkor",
    website: "https://verkor.com",
    summary: "Low-carbon electric vehicle gigafactory and battery cell manufacturer",
    details: "Verkor accelerates the European transition to sustainable mobility by building gigafactories producing low-carbon lithium-ion battery cells for automakers like Renault Group.\nOpen roles: Battery Testing Engineer, Manufacturing Automation Developer, MES / SCADA Software Engineer, Battery Data Analyst.\nApply via careers portal or careers@verkor.com.",
    location: "Grenoble, Dunkirk, France · Hybrid",
    remote: false,
    stage: "Scale-up · CleanTech",
    roles: [
      "Battery Testing Engineer",
      "Manufacturing Automation Developer",
      "SCADA Software Engineer",
      "Battery Data Analyst",
    ],
    emails: [
      { email: "careers@verkor.com", label: "Hiring", from: "https://verkor.com/en/careers/", onRequest: false, foundAt: new Date().toISOString() },
    ],
    links: [
      { label: "Careers & Jobs", url: "https://verkor.com/en/careers/" },
      { label: "Website", url: "https://verkor.com" },
    ],
    postedAt: new Date().toISOString(),
  },
  {
    source: "EU",
    externalId: "northvolt",
    company: "Northvolt",
    website: "https://northvolt.com",
    summary: "Sustainable lithium-ion battery cells and circular clean energy technology in Europe",
    details: "Northvolt produces eco-friendly automotive and industrial battery cells with minimal carbon footprint and closed-loop recycling.\nOpen roles: Software Engineer (Fullstack/Python/React), Battery Management System Architect, Data Infrastructure Engineer, Factory Automation Engineer.\nApply via careers portal or careers@northvolt.com.",
    location: "Stockholm, Sweden · Remote Europe",
    remote: true,
    stage: "Scale-up · CleanTech",
    roles: [
      "Software Engineer (Python/React)",
      "Battery Management System Architect",
      "Data Infrastructure Engineer",
      "Automation Engineer",
    ],
    emails: [
      { email: "careers@northvolt.com", label: "Hiring", from: "https://northvolt.com/career/", onRequest: false, foundAt: new Date().toISOString() },
    ],
    links: [
      { label: "Careers & Jobs", url: "https://northvolt.com/career/" },
      { label: "Website", url: "https://northvolt.com" },
    ],
    postedAt: new Date().toISOString(),
  },
  {
    source: "EU",
    externalId: "pleo",
    company: "Pleo",
    website: "https://www.pleo.io",
    summary: "Smart corporate spending cards and automated business expense management across Europe",
    details: "Pleo issues smart company cards and expense software trusted by 30,000+ businesses across the UK, Germany, France, and the Nordics.\nOpen roles: Backend Engineer (Kotlin/Node), Mobile Engineer (Android/iOS), Staff Frontend Engineer (TypeScript/React), DevOps Engineer (Kubernetes/AWS).\nApply via careers portal or careers@pleo.io.",
    location: "Copenhagen, Denmark · Remote Europe",
    remote: true,
    stage: "Unicorn · Fintech",
    roles: [
      "Backend Engineer (Kotlin/Node)",
      "Mobile Engineer (Android/iOS)",
      "Staff Frontend Engineer",
      "DevOps Engineer",
    ],
    emails: [
      { email: "careers@pleo.io", label: "Hiring", from: "https://careers.pleo.io", onRequest: false, foundAt: new Date().toISOString() },
    ],
    links: [
      { label: "Careers & Jobs", url: "https://careers.pleo.io" },
      { label: "Website", url: "https://www.pleo.io" },
    ],
    postedAt: new Date().toISOString(),
  },
  {
    source: "EU",
    externalId: "payhawk",
    company: "Payhawk",
    website: "https://payhawk.com",
    summary: "Spend management software, corporate Visa cards, and automated multi-currency accounting",
    details: "Payhawk combines corporate credit cards, expense tracking, invoice payments, and automated ERP reconciliation into one seamless platform for enterprises.\nOpen roles: Senior Full Stack Engineer (C#/.NET/React), Backend Developer, Mobile Application Developer, Cloud Platform Engineer.\nApply via careers portal or jobs@payhawk.com.",
    location: "London, UK · Sofia, Bulgaria · Remote Europe",
    remote: true,
    stage: "Unicorn · Fintech",
    roles: [
      "Senior Full Stack Engineer (.NET/React)",
      "Backend Developer",
      "Mobile App Developer",
      "Cloud Platform Engineer",
    ],
    emails: [
      { email: "jobs@payhawk.com", label: "Hiring", from: "https://payhawk.com/careers", onRequest: false, foundAt: new Date().toISOString() },
    ],
    links: [
      { label: "Careers & Jobs", url: "https://payhawk.com/careers" },
      { label: "Website", url: "https://payhawk.com" },
    ],
    postedAt: new Date().toISOString(),
  },
  {
    source: "EU",
    externalId: "smartly-io",
    company: "Smartly.io",
    website: "https://www.smartly.io",
    summary: "AI-driven multi-channel creative and social advertising automation platform",
    details: "Smartly.io automates digital creative production, performance marketing, and ad optimization across Meta, TikTok, Google, and Pinterest for the world's largest brands.\nOpen roles: Senior Full Stack Developer (React/Node/Ruby), Machine Learning Engineer, Senior Data Engineer, Platform Security Engineer.\nApply via careers portal or careers@smartly.io.",
    location: "Helsinki, Finland · Remote Europe",
    remote: true,
    stage: "Scale-up · AI AdTech",
    roles: [
      "Senior Full Stack Developer",
      "Machine Learning Engineer",
      "Senior Data Engineer",
      "Platform Security Engineer",
    ],
    emails: [
      { email: "careers@smartly.io", label: "Hiring", from: "https://www.smartly.io/careers", onRequest: false, foundAt: new Date().toISOString() },
    ],
    links: [
      { label: "Careers & Jobs", url: "https://www.smartly.io/careers" },
      { label: "Website", url: "https://www.smartly.io" },
    ],
    postedAt: new Date().toISOString(),
  },
];

async function seed() {
  const prisma = createPrismaClient(process.env.DATABASE_URL!);
  const now = new Date();
  const profileData = {
    basics: {
      name: "",
      email: "",
      phone: "",
      headline: "",
      city: "Paris",
      country: "France",
      dob: "",
      website: "",
      address: "",
      linkedin: "",
      summary: "",
      showAge: false,
    },
    skills: [],
    experience: [],
  };
  const userPlace = placeOf(profileData.basics);

  console.log(`Seeding ${STARTUPS.length} French and European startups...`);

  for (const startup of STARTUPS) {
    const fit = matchStartup(startup, profileData, userPlace, now);
    const data = {
      source: startup.source,
      externalId: startup.externalId,
      company: startup.company,
      website: startup.website,
      summary: startup.summary,
      details: startup.details,
      location: startup.location,
      remote: startup.remote,
      stage: startup.stage,
      roles: startup.roles,
      emails: startup.emails,
      links: startup.links,
      postedAt: startup.postedAt ? new Date(startup.postedAt) : null,
      score: fit.score || 85,
      reasons: fit.reasons.length ? fit.reasons : ["European Tech leader", "Active tech hiring", "Remote open to Europe"],
      scoredWith: MATCH_VERSION,
      seenAt: now,
    };

    await prisma.startup.upsert({
      where: {
        source_externalId: {
          source: startup.source,
          externalId: startup.externalId,
        },
      },
      create: data,
      update: data,
    });
    console.log(`✓ Seeded ${startup.company} (${startup.location})`);
  }

  await prisma.$disconnect();
  console.log("Seeding complete!");
}

seed().catch((err) => {
  console.error("Seeding error:", err);
  process.exit(1);
});
