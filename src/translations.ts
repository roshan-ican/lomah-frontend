export interface TranslationSet {
  brand: string;
  secureTerminal: string;
  operatorAuth: string;
  username: string;
  password: string;
  /** @deprecated use username — kept for cached bundles / older references */
  operatorId: string;
  accessKey: string;
  initAccess: string;
  forgotCreds: string;
  regTacticalProfile: string;
  regUnitAssignment: string;
  createProfile: string;
  returnLogin: string;
  liveSession: string;
  rangeMap: string;
  ballisticsCalc: string;
  inventoryMatrix: string;
  analyticsConsole: string;
  interactiveHelp: string;
  logoutNode: string;
  target: string;
  distance: string;
  operative: string;
  resumeRec: string;
  suspendRec: string;
  resetTelemetry: string;
  circularRing: string;
  figureTarget: string;
  shotsFired: string;
  totalScore: string;
  avgDeviation: string;
  shotLog: string;
  score: string;
  devCoordinate: string;
  zone: string;
  roleShooter: string;
  roleAdmin: string;
  adminControls: string;
  adminDescription: string;
  activeShooters: string;
  overallAccuracy: string;
  rangeEfficiency: string;
  liveCommandGrid: string;
  systemActivityLog: string;
  status: string;
  elapsedTime: string;
  operatorRegistration: string;
  acknowledgedText: string;
  sysOnline: string;
  stableLink: string;
  localWorkspace: string;
  tapToSimulate: string;
  targetMatrixCompiling: string;
  chest: string;
  head: string;
  shoulder: string;
  body: string;
  offTarget: string;
}

export const translations: Record<"en" | "ar", TranslationSet> = {
  en: {
    brand: "",
    secureTerminal: "RANGE MANAGEMENT SYSTEM v.1",
    operatorAuth: "SHOOTER TERMINAL ACCESS",
    username: "USERNAME",
    password: "PASSWORD",
    operatorId: "USERNAME",
    accessKey: "PASSWORD",
    initAccess: "START SESSION",
    forgotCreds: "FORGOT ACCESS KEY?",
    regTacticalProfile: "REGISTER NEW SHOOTER PROFILE",
    regUnitAssignment: "UNIT ASSIGNMENT",
    createProfile: "CREATE PROFILE",
    returnLogin: "BACK TO LOGIN",
    liveSession: "Range Session",
    rangeMap: "Range Map & Radar",
    ballisticsCalc: "Ballistics Calculator",
    inventoryMatrix: "Equipment Management",
    analyticsConsole: "Practice History",
    interactiveHelp: "Admin Guide & Help",
    logoutNode: "Logout Screen",
    target: "Target Profile",
    distance: "Distance",
    operative: "Shooter",
    resumeRec: "RESUME SESSION",
    suspendRec: "PAUSE SESSION",
    resetTelemetry: "RESET PRACTICE",
    circularRing: "CIRCULAR BULLSEYE",
    figureTarget: "SILHOUETTE TARGET",
    shotsFired: "SHOTS FIRED",
    totalScore: "TOTAL SCORE",
    avgDeviation: "AVG DEVIATION (MM)",
    shotLog: "SHOT LOG / TIMELINE",
    score: "SCORE",
    devCoordinate: "COORDS (X,Y)",
    zone: "HIT ZONE",
    roleShooter: "Shooter Terminal Mode",
    roleAdmin: "Range Control Center",
    adminControls: "Range Control Center",
    adminDescription:
      "System administrator overseer & real-time shooting controllers dashboard.",
    activeShooters: "Active Lanes",
    overallAccuracy: "Overall Group Accuracy",
    rangeEfficiency: "Range Efficiency Status",
    liveCommandGrid: "Active Lanes Status",
    systemActivityLog: "Activity Log",
    status: "STATUS",
    elapsedTime: "ELAPSED TIME",
    operatorRegistration: "SHOOTER REGISTRATION",
    acknowledgedText:
      "By registering a custom device profile, you authorize secure local logging of practice telemetry and score records.",
    sysOnline: "RANGE LINK: ENGAGED",
    stableLink: "LINK STABLE",
    localWorkspace: "LOCAL WORKSPACE PWA",
    tapToSimulate: "TAP OR CLICK ON TARGET SPACE TO SIMULATE SHOT",
    targetMatrixCompiling: "SHOT PLACEMENT MAP",
    chest: "Center Mass (Chest)",
    head: "Head Target",
    shoulder: "Shoulder Target",
    body: "Torso Zone",
    offTarget: "Miss",
  },
  ar: {
    brand: "لوما الدقيق (LOMAH)",
    secureTerminal: "منظومة إدارة ميادين الرماية v2.4",
    operatorAuth: "تسجيل دخول الرامي",
    username: "اسم المستخدم",
    password: "كلمة المرور",
    operatorId: "اسم المستخدم",
    accessKey: "كلمة المرور",
    initAccess: "بدء الجلسة التدريبية",
    forgotCreds: "هل نسيت مفتاح الدخول؟",
    regTacticalProfile: "تسجيل ملف تعريفي لرامٍ جديد",
    regUnitAssignment: "الوحدة أو الكتيبة المكلفة",
    createProfile: "إنشاء الملف التعريفي",
    returnLogin: "العودة لتسجيل الدخول",
    liveSession: "جلسة الرماية المباشرة",
    rangeMap: "موقع الميدان والرادار",
    ballisticsCalc: "حاسبة المقذوفات والمسار",
    inventoryMatrix: "إدارة المعدات والذخيرة",
    analyticsConsole: "سجل الأنشطة والتدريب",
    interactiveHelp: "دليل المشرف والدعم",
    logoutNode: "تسجيل الخروج",
    target: "نوع الهدف المعين",
    distance: "مسافة رشق الهدف",
    operative: "الرامي الممارس",
    resumeRec: "استئناف رصد البيانات",
    suspendRec: "إيقاف مؤقت للجلسة",
    resetTelemetry: "إعادة تصفير الجلسة",
    circularRing: "هدف الحلقات الدائرية",
    figureTarget: "هدف الشاخص البشري",
    shotsFired: "الطلقات النارية المنفذة",
    totalScore: "مجموع النقاط المحرز",
    avgDeviation: "متوسط الانحراف (مم)",
    shotLog: "سجل الإطلاقات والوقت",
    score: "النتيجة",
    devCoordinate: "إحداثيات الإصابة (X,Y)",
    zone: "منطقة الإصابة",
    roleShooter: "وضع رامي الرماية",
    roleAdmin: "مركز التحكم بالميدان",
    adminControls: "مركز التحكم بالميدان (Range Control)",
    adminDescription:
      "لوحة تحكم المشرف العام وإدارة حارات الرماة في الوقت الفعلي.",
    activeShooters: "الحارات النشطة",
    overallAccuracy: "دقة المجموعة العامة",
    rangeEfficiency: "كفاءة أنشطة الميدان المباشرة",
    liveCommandGrid: "حالات الحارات المباشرة",
    systemActivityLog: "سجل الأنشطة والعمليات",
    status: "الحالة التشغيلية",
    elapsedTime: "الوقت المنقضي بدقة",
    operatorRegistration: "تسجيل رامي جديد بالمنظومة",
    acknowledgedText:
      "بتسجيل هذا الملف التعريفي الخاص بالجهاز، فإنك توافق على تخزين وحفظ بيانات جولات الرماية المحسوبة محلياً وفي سجلات المشرف.",
    sysOnline: "اتصال الشبكة: مفعل ونشط",
    stableLink: "رابط الإشارة مستقر",
    localWorkspace: "بيئة عمل محلية مؤمنة PWA",
    tapToSimulate: "اضغط على مساحة الهدف لإطلاق رصاصة محاكاة دقيقة",
    targetMatrixCompiling: "خريطة موضع الإطلاقات",
    chest: "مركز الصدر",
    head: "الرأس Target",
    shoulder: "الكتف",
    body: "منطقة الجسد / الجذع",
    offTarget: "خارج الهدف (خطأ)",
  },
};
