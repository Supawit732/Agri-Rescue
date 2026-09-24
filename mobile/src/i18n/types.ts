export type Locale = 'th' | 'en';

export type Messages = {
  common: {
    loading: string;
    retry: string;
    login: string;
    logout: string;
    back: string;
    cancel: string;
    save: string;
    language: string;
    thai: string;
    english: string;
  };
  tabs: {
    market: string;
    sell: string;
    orders: string;
    notifications: string;
    account: string;
  };
  market: {
    title: string;
    empty: string;
    enableBuy: string;
    goAccount: string;
    guestBanner: string;
    buy: string;
    requestDonation: string;
    byFarmer: string;
    distanceUnknown: string;
    gradeNormal: string;
    gradeSub: string;
    minOrder: string;
    wholeLot: string;
    remaining: string;
    badgeSell: string;
    badgeDonate: string;
    badgeDonateOk: string;
    km: string;
  };
  lot: {
    title: string;
    loginToBook: string;
    loginToBuy: string;
    loginToDonate: string;
    goConfirm: string;
    backToMarket: string;
    qtyLabel: string;
    approxTotal: string;
    remaining: string;
    approxDistance: string;
  };
  dashboard: {
    title: string;
    loginTitle: string;
    loginMessage: string;
    scopeAdmin: string;
    scopeSeller: string;
    kgSaved: string;
    co2e: string;
    farmerIncome: string;
    donatedKg: string;
    orderCount: string;
    dailyKg: string;
    byCrop: string;
    ordersByStatus: string;
    aiAccuracy: string;
    emptyCharts: string;
    matched: string;
    unitKg: string;
    unitBaht: string;
  };
  account: {
    title: string;
    loginMessage: string;
    dashboard: string;
    profile: string;
    language: string;
  };
  sell: {
    ripeness: string;
    ripenessRequired: string;
    ripenessInvite: string;
    ripenessSourceUser: string;
    ripenessSourceAi: string;
    weatherForecast: string;
    weatherFallback: string;
    publish: string;
    saveEdit: string;
    assessing: string;
  };
  login: {
    title: string;
    tagline: string;
    phone: string;
    phonePlaceholder: string;
    phoneInvalid: string;
    password: string;
    passwordRequired: string;
    submit: string;
    noAccount: string;
    register: string;
    failed: string;
  };
  status: Record<string, string>;
  ripenessLabels: readonly [string, string, string, string, string];
  grade: { normal: string; substandard: string };
};

export const locales: Locale[] = ['th', 'en'];
