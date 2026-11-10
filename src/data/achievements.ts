// Shown on /achievements, grouped by `group`. Leave `year` empty when unsure rather than guessing.
export type Achievement = { title: string; org: string; year: string; description: string; group: "Competitions" | "Research" | "Community" | "Open source and scholarships" };

export const achievements: Achievement[] = [
  // Competitions
  { group: "Competitions", title: "7th in Nepal, top 700 worldwide", org: "IEEEXtreme 2024", year: "2024", description: "24 hours of competitive programming against 7,000+ teams, in C++, under tight memory and time limits." },
  { group: "Competitions", title: "Winner", org: "Aarohan 2.0 national rapid coding contest", year: "", description: "A paired speed-coding challenge: fast algorithms, edge cases and no time to panic." },
  { group: "Competitions", title: "Winner, game development", org: "Locus Hack-A-Week", year: "", description: "For Mathemagic, a puzzle game set in a mathemagical forest." },
  { group: "Competitions", title: "Winner", org: "Hackademia hackathon", year: "", description: "For Sangyaan, a learning app for children with dysgraphia and dyscalculia." },
  { group: "Competitions", title: "Winner", org: "IEEE Computer Society Ideathon, Pulchowk", year: "", description: "Best concept for running a regional technical programme." },
  { group: "Competitions", title: "Finalist", org: "IEEE “Can You C?”", year: "", description: "For ChatChamber, a multithreaded chat server written from scratch in C." },
  { group: "Competitions", title: "Top 10 of 28 teams, AI track", org: "MLH Semicolon hackathon", year: "", description: "A real-time bird sound detector with a live map of sightings." },
  { group: "Competitions", title: "On-campus finalist", org: "Hult Prize IOE", year: "2023", description: "Co-founded and pitched a venture on sustainable, traceable fashion." },

  // Research
  { group: "Research", title: "Lightweight parasitic egg detection with a modified YOLOv11", org: "International Journal on Engineering Technology, Vol. 3 No. 1", year: "2025", description: "0.96 mAP@0.5 with 58% fewer parameters than the baseline, small enough for phones and CPUs." },
  { group: "Research", title: "CNN-based bird sound detection: a comparative study", org: "International Journal on Engineering Technology, Vol. 2 No. 2", year: "2025", description: "A tuned ResNet50 reached 90.75% accuracy on noisy outdoor recordings." },

  // Community
  { group: "Community", title: "Ed-Tech Lead", org: "Google Developer Groups Kathmandu", year: "2024 to now", description: "Workshops, study jams and speaker line-ups for DevFest Kathmandu and Google I/O Extended. Before that, a year as designer and organiser." },
  { group: "Community", title: "Organiser and design volunteer", org: "UbuCon Asia 2025, Kathmandu", year: "2025", description: "Helped run the pan-Asian Ubuntu and open-source conference, including its branding." },
  { group: "Community", title: "Notion Campus Leader", org: "Notion", year: "", description: "Workshops on project management, documentation and team systems across engineering colleges." },
  { group: "Community", title: "Student Partner", org: "Leapfrog Technology", year: "", description: "Taught Git and GitHub to 50+ engineering students." },
  { group: "Community", title: "Coordinator", org: "KEC Computer Club", year: "", description: "Bootcamps, hackathons, guest lectures and peer mentoring at Kantipur Engineering College." },

  // Open source and scholarships
  { group: "Open source and scholarships", title: "Top contributor", org: "Leapfrog Frogtoberfest", year: "2023, 2024", description: "Pull requests to community open-source projects." },
  { group: "Open source and scholarships", title: "Completed", org: "DigitalOcean Hacktoberfest", year: "2024, 2025", description: "Open-source contributions across public repositories." },
  { group: "Open source and scholarships", title: "Merit scholarship, five semesters", org: "Kantipur Engineering College", year: "", description: "For top results in the Tribhuvan University board exams, semesters II to VI." },
];
