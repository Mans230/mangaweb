/**
 * zeko-manga — بيانات تجريبية مشتركة
 * كل وكلاء الصفحات يعتمدون على هذا الملف حتى يتم ربط الـ API الحقيقي.
 */

export type MangaType = "مانهوا" | "مانجا" | "مانها";
export type MangaStatus = "مستمر" | "مكتمل" | "متوقف";

export interface Manga {
  id: number;
  slug: string;
  title: string;
  altTitle?: string;
  cover: string;
  type: MangaType;
  status: MangaStatus;
  rating: number;
  ratingCount: number;
  chapters: number;
  views: string;
  genres: string[];
  synopsis: string;
  source: SourceName;
  isAdult?: boolean;
  updatedAt: string; // e.g. "قبل 12 د"
}

export type SourceName =
  | "kawaiimanga"
  | "olympustaff"
  | "azorafly"
  | "mangatime"
  | "rocksmanga"
  | "3asq"
  | "despair-manga"
  | "mangadar";

export interface Source {
  name: SourceName;
  status: "نشط" | "قيد المعالجة";
}

export interface LatestChapter {
  id: number;
  mangaSlug: string;
  mangaTitle: string;
  cover: string;
  chapter: number;
  timeAgo: string;
  source: SourceName;
  isNew: boolean; // أقل من 24 ساعة
}

export const sources: Source[] = [
  { name: "kawaiimanga", status: "نشط" },
  { name: "olympustaff", status: "نشط" },
  { name: "azorafly", status: "نشط" },
  { name: "mangatime", status: "نشط" },
  { name: "rocksmanga", status: "نشط" },
  { name: "3asq", status: "نشط" },
  { name: "despair-manga", status: "نشط" },
  { name: "mangadar", status: "قيد المعالجة" },
];

export const genres: { name: string; count: string; popular?: boolean; adult?: boolean }[] = [
  { name: "أكشن", count: "2.3K", popular: true },
  { name: "فانتازيا", count: "1.9K", popular: true },
  { name: "رومانسي", count: "1.4K", popular: true },
  { name: "نظام / Level Up", count: "860", popular: true },
  { name: "موريم", count: "640" },
  { name: "إعادة تجسد", count: "920" },
  { name: "مدرسي", count: "780" },
  { name: "كوميدي", count: "1.1K" },
  { name: "دراما", count: "690" },
  { name: "خارق للطبيعة", count: "540" },
  { name: "مغامرة", count: "1.6K" },
  { name: "خيال علمي", count: "420" },
  { name: "رعب", count: "310" },
  { name: "+18", count: "210", adult: true },
];

export const mangaList: Manga[] = [
  {
    id: 1,
    slug: "return-of-the-shattered-king",
    title: "عودة الملك المدمّر",
    altTitle: "Return of the Shattered King",
    cover: "/cover-01.png",
    type: "مانهوا",
    status: "مستمر",
    rating: 4.8,
    ratingCount: 12400,
    chapters: 152,
    views: "8.2M",
    genres: ["أكشن", "فانتازيا", "نظام / Level Up"],
    synopsis:
      "بعد خيانة رفاقه وسقوطه في الهاوية، يعود 'كايل' — الملك الذي حكم أقوى الزنازين — إلى الماضي وبحوزته كل أسرار المستقبل. هذه المرة لن يغفر لأحد.",
    source: "azorafly",
    updatedAt: "قبل 12 د",
  },
  {
    id: 2,
    slug: "moonlight-contract",
    title: "عقد ضوء القمر",
    cover: "/cover-02.png",
    type: "مانهوا",
    status: "مستمر",
    rating: 4.6,
    ratingCount: 8300,
    chapters: 98,
    views: "4.1M",
    genres: ["رومانسي", "دراما", "خارق للطبيعة"],
    synopsis:
      "زواج عقدي بين وريثة عائلة مفلسة ودوق بارد القلب تحلّ عليه لعنة قمرية. لكن مع كل ليلة اكتمال، يقترب قلباهما أكثر مما يجب.",
    source: "kawaiimanga",
    updatedAt: "قبل 25 د",
  },
  {
    id: 3,
    slug: "villain-of-the-end",
    title: "شرير النهاية",
    cover: "/cover-03.png",
    type: "مانهوا",
    status: "مستمر",
    rating: 4.7,
    ratingCount: 9100,
    chapters: 130,
    views: "6.7M",
    genres: ["أكشن", "فانتازيا", "إعادة تجسد"],
    synopsis:
      "يستيقظ مؤلف رواية فاشلة داخل عالمه الخاص… في جسد الشرير النهائي المحكوم عليه بالموت في الفصل 300. خطته الوحيدة: أن يصبح أسوأ من السيناريو نفسه.",
    source: "despair-manga",
    updatedAt: "قبل 40 د",
  },
  {
    id: 4,
    slug: "my-little-sunshine",
    title: "شمسي الصغيرة",
    cover: "/cover-04.png",
    type: "مانجا",
    status: "مكتمل",
    rating: 4.4,
    ratingCount: 5200,
    chapters: 64,
    views: "2.3M",
    genres: ["كوميدي", "رومانسي", "مدرسي"],
    synopsis:
      "قصة يوميات لطيفة بين فتى انطوائي وفتاة مشمسة لا تعرف الاستسلام — أربع سنوات من الضحك والدموع في ثانوية واحدة.",
    source: "mangatime",
    updatedAt: "أمس",
  },
  {
    id: 5,
    slug: "fist-of-the-northern-peak",
    title: "قبضة القمة الشمالية",
    cover: "/cover-05.png",
    type: "مانها",
    status: "مستمر",
    rating: 4.5,
    ratingCount: 7800,
    chapters: 210,
    views: "5.9M",
    genres: ["موريم", "أكشن", "مغامرة"],
    synopsis:
      "ابن عامل بسيط يحمل دماء سيف أسطوري منسيّ. حين تسقط طائفته في مؤامرة، يبدأ رحلته نحو القمة الشمالية — ونحو انتقام لم يشهد له الموريم مثيلاً.",
    source: "rocksmanga",
    updatedAt: "قبل ساعة",
  },
  {
    id: 6,
    slug: "elven-heir",
    title: "وارثة الغابة الأبدية",
    cover: "/cover-06.png",
    type: "مانجا",
    status: "مستمر",
    rating: 4.3,
    ratingCount: 4100,
    chapters: 77,
    views: "1.8M",
    genres: ["فانتازيا", "مغامرة", "دراما"],
    synopsis:
      "آخر وريثة لعرش الغابة الأبدية تخرج من عزلتها بعد ألف عام لتجد العالم قد نسي الجان… ونسي لماذا كان يجب أن يبقى محبوساً.",
    source: "3asq",
    updatedAt: "قبل 3 س",
  },
  {
    id: 7,
    slug: "gate-of-the-abyss",
    title: "بوابة الهاوية",
    cover: "/cover-07.png",
    type: "مانهوا",
    status: "مستمر",
    rating: 4.9,
    ratingCount: 15800,
    chapters: 178,
    views: "12.4M",
    genres: ["أكشن", "نظام / Level Up", "خارق للطبيعة"],
    synopsis:
      "حين ظهرت البوابات في سماء المدن، كان 'جين' أضعف صياد من الرتبة E. لكن بوابة مزدوجة غامضة تمنحه نظاماً لا يملكه أحد سواه: نظام الهاوية.",
    source: "olympustaff",
    updatedAt: "قبل 8 د",
  },
  {
    id: 8,
    slug: "throne-of-a-thousand-lives",
    title: "عرش الألف حياة",
    cover: "/cover-08.png",
    type: "مانهوا",
    status: "مستمر",
    rating: 4.6,
    ratingCount: 6700,
    chapters: 143,
    views: "4.8M",
    genres: ["إعادة تجسد", "فانتازيا", "دراما"],
    synopsis:
      "عاش ألف حياة: ملكاً وقاتلاً وراهباً وخائناً. في حياته الألف وواحد، يستيقظ على العرش الذي لطالما هرب منه — وكل أرواح حيواته تطالب بالحساب.",
    source: "mangadar",
    updatedAt: "قبل ساعتين",
  },
  {
    id: 9,
    slug: "academys-hidden-genius",
    title: "عبقري الأكاديمية المتواري",
    cover: "/cover-09.png",
    type: "مانهوا",
    status: "مستمر",
    rating: 4.2,
    ratingCount: 5600,
    chapters: 88,
    views: "3.1M",
    genres: ["مدرسي", "فانتازيا", "أكشن"],
    synopsis:
      "أقوى ساحر في القارة يتنكّر كطالب فاشل في أكاديمية السحر الملكية هرباً من حرب لا يريدها. لكن الأسرار لا تبقى مدفونة طويلاً.",
    source: "kawaiimanga",
    updatedAt: "قبل 5 س",
  },
  {
    id: 10,
    slug: "demon-lords-second-life",
    title: "حياة ملك الشياطين الثانية",
    cover: "/cover-10.png",
    type: "مانهوا",
    status: "مكتمل",
    rating: 4.7,
    ratingCount: 11200,
    chapters: 220,
    views: "9.6M",
    genres: ["فانتازيا", "إعادة تجسد", "أكشن"],
    isAdult: true,
    synopsis:
      "بعد هزيمته على يد البطل، يتجسد ملك الشياطين من جديد… كطفل في قرية بشرية. بين حنين المجد المفقود ودفء الحياة الجديدة، يختار طريقاً ثالثاً.",
    source: "azorafly",
    updatedAt: "منذ أسبوع",
  },
  {
    id: 11,
    slug: "sword-maiden-of-dawn",
    title: "سيدة سيف الفجر",
    cover: "/cover-11.png",
    type: "مانجا",
    status: "مستمر",
    rating: 4.5,
    ratingCount: 6300,
    chapters: 96,
    views: "3.7M",
    genres: ["أكشن", "مغامرة", "خارق للطبيعة"],
    synopsis:
      "محاربة تحمل سيفاً ملعوناً يمتص ذكرياتها مع كل نزال. تقاتل لتستعيد اسمها المنسي — قبل أن يبتلع السيف آخر ما تبقى منها.",
    source: "3asq",
    updatedAt: "قبل 30 د",
  },
  {
    id: 12,
    slug: "steel-horizon",
    title: "أفق الفولاذ",
    cover: "/cover-12.png",
    type: "مانجا",
    status: "مستمر",
    rating: 4.1,
    ratingCount: 3400,
    chapters: 54,
    views: "1.2M",
    genres: ["خيال علمي", "أكشن", "دراما"],
    synopsis:
      "في مستعمرة مدارية محاصرة، تكتشف طيّارة ميكا شابة أن آلة الحرب التي تقودها تحمل وعياً قديماً… ووعداً بإنهاء الحرب من الداخل.",
    source: "mangatime",
    updatedAt: "أمس",
  },
];

export const latestChapters: LatestChapter[] = [
  { id: 1, mangaSlug: "gate-of-the-abyss", mangaTitle: "بوابة الهاوية", cover: "/cover-07.png", chapter: 178, timeAgo: "قبل 8 د", source: "olympustaff", isNew: true },
  { id: 2, mangaSlug: "return-of-the-shattered-king", mangaTitle: "عودة الملك المدمّر", cover: "/cover-01.png", chapter: 152, timeAgo: "قبل 12 د", source: "azorafly", isNew: true },
  { id: 3, mangaSlug: "moonlight-contract", mangaTitle: "عقد ضوء القمر", cover: "/cover-02.png", chapter: 98, timeAgo: "قبل 25 د", source: "kawaiimanga", isNew: true },
  { id: 4, mangaSlug: "sword-maiden-of-dawn", mangaTitle: "سيدة سيف الفجر", cover: "/cover-11.png", chapter: 96, timeAgo: "قبل 30 د", source: "3asq", isNew: true },
  { id: 5, mangaSlug: "villain-of-the-end", mangaTitle: "شرير النهاية", cover: "/cover-03.png", chapter: 130, timeAgo: "قبل 40 د", source: "despair-manga", isNew: true },
  { id: 6, mangaSlug: "fist-of-the-northern-peak", mangaTitle: "قبضة القمة الشمالية", cover: "/cover-05.png", chapter: 210, timeAgo: "قبل ساعة", source: "rocksmanga", isNew: true },
  { id: 7, mangaSlug: "throne-of-a-thousand-lives", mangaTitle: "عرش الألف حياة", cover: "/cover-08.png", chapter: 143, timeAgo: "قبل ساعتين", source: "mangadar", isNew: true },
  { id: 8, mangaSlug: "elven-heir", mangaTitle: "وارثة الغابة الأبدية", cover: "/cover-06.png", chapter: 77, timeAgo: "قبل 3 س", source: "3asq", isNew: true },
  { id: 9, mangaSlug: "academys-hidden-genius", mangaTitle: "عبقري الأكاديمية المتواري", cover: "/cover-09.png", chapter: 88, timeAgo: "قبل 5 س", source: "kawaiimanga", isNew: true },
  { id: 10, mangaSlug: "demon-lords-second-life", mangaTitle: "حياة ملك الشياطين الثانية", cover: "/cover-10.png", chapter: 220, timeAgo: "قبل 9 س", source: "azorafly", isNew: true },
  { id: 11, mangaSlug: "steel-horizon", mangaTitle: "أفق الفولاذ", cover: "/cover-12.png", chapter: 54, timeAgo: "أمس", source: "mangatime", isNew: false },
  { id: 12, mangaSlug: "my-little-sunshine", mangaTitle: "شمسي الصغيرة", cover: "/cover-04.png", chapter: 64, timeAgo: "أمس", source: "mangatime", isNew: false },
];

/** الأكثر شعبية — مرتبة تنازلياً */
export const popularManga: Manga[] = [
  mangaList[6], // بوابة الهاوية
  mangaList[0], // عودة الملك المدمّر
  mangaList[9], // حياة ملك الشياطين الثانية
  mangaList[2], // شرير النهاية
  mangaList[4], // قبضة القمة الشمالية
  mangaList[7], // عرش الألف حياة
  mangaList[1], // عقد ضوء القمر
  mangaList[10], // سيدة سيف الفجر
  mangaList[8], // عبقري الأكاديمية
  mangaList[5], // وارثة الغابة
];

/** أحدث الإضافات — الأول هو العرض الكبير */
export const latestAdditions: Manga[] = [
  mangaList[4],
  mangaList[8],
  mangaList[11],
  mangaList[3],
  mangaList[5],
  mangaList[10],
  mangaList[1],
  mangaList[7],
  mangaList[2],
];

export interface HeroSlide {
  mangaSlug: string;
  image: string;
  title: string;
  synopsis: string;
  genres: string[];
  rating: number;
  chapters: number;
  status: MangaStatus;
  type: MangaType;
}

export const heroSlides: HeroSlide[] = [
  {
    mangaSlug: "return-of-the-shattered-king",
    image: "/hero-cover-1.png",
    title: "عودة الملك المدمّر",
    synopsis:
      "خانه رفاقه وسقط في الهاوية… وعاد إلى الماضي بكل أسرار المستقبل. هذه المرة، لن يغفر لأحد.",
    genres: ["أكشن", "فانتازيا"],
    rating: 4.8,
    chapters: 152,
    status: "مستمر",
    type: "مانهوا",
  },
  {
    mangaSlug: "academys-hidden-genius",
    image: "/hero-cover-2.png",
    title: "عبقري الأكاديمية المتواري",
    synopsis:
      "أقوى ساحر في القارة يتنكر كطالب فاشل هرباً من حرب لا يريدها — لكن الأسرار لا تبقى مدفونة طويلاً.",
    genres: ["مدرسي", "فانتازيا"],
    rating: 4.2,
    chapters: 88,
    status: "مستمر",
    type: "مانهوا",
  },
  {
    mangaSlug: "steel-horizon",
    image: "/hero-cover-3.png",
    title: "أفق الفولاذ",
    synopsis:
      "مستعمرة مدارية محاصرة، وطيّارة ميكا تكتشف أن آلتها تحمل وعياً قديماً… ووعداً بإنهاء الحرب.",
    genres: ["خيال علمي", "أكشن"],
    rating: 4.1,
    chapters: 54,
    status: "مستمر",
    type: "مانجا",
  },
];

export const quickStats = [
  { id: "sources", value: 8, suffix: "", label: "مصادر", icon: "database" },
  { id: "series", value: 5200, suffix: "+", label: "سلسلة", icon: "book-open" },
  { id: "chapters", value: 120, suffix: "K+", label: "فصل", icon: "layers" },
  { id: "refresh", value: 30, suffix: "", label: "تحديث كل دقيقة", icon: "refresh-cw", prefix: "كل " },
] as const;

export function getMangaBySlug(slug: string): Manga | undefined {
  return mangaList.find((m) => m.slug === slug);
}

export function timeAgoLabel(isNew: boolean): string {
  return isNew ? "جديد" : "";
}
