import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DonorQuota, DonorTier, DonorTierRule, QuotaRequirement } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { labelDonorTier } from '../donorLabels';
import { formatTemplate, useI18n } from '../i18n';
import type { Messages } from '../i18n/types';
import { C, fonts, radius } from '../theme';
import { PrimaryButton, SecondaryButton } from './ui';

/** Loads tier rules + the caller's quota; refetches when their donor state changes. */
export function useDonorQuota(): DonorQuota | null {
  const { user, api } = useAuth();
  const [quota, setQuota] = useState<DonorQuota | null>(null);
  const userId = user?.id ?? null;
  const tier = user?.donor_tier ?? null;
  const orgStatus = user?.org_status ?? null;
  const remaining = user?.donation_remaining_kg ?? null;
  useEffect(() => {
    if (userId === null) {
      setQuota(null);
      return;
    }
    let active = true;
    api
      .getDonorQuota()
      .then((next) => {
        if (active) setQuota(next);
      })
      .catch(() => {
        if (active) setQuota(null);
      });
    return () => {
      active = false;
    };
  }, [api, userId, tier, orgStatus, remaining]);
  return quota;
}

function ruleFor(quota: DonorQuota, tier: DonorTier): DonorTierRule | undefined {
  return quota.tiers.find((r) => r.tier === tier);
}

function tierQuotaText(rule: DonorTierRule, t: Messages): string {
  return rule.weekly_cap_kg !== null
    ? formatTemplate(t.donorQuota.quotaFixed, { cap: rule.weekly_cap_kg })
    : formatTemplate(t.donorQuota.quotaPerBeneficiary, { per: rule.kg_per_beneficiary ?? 0 });
}

function requirementText(req: QuotaRequirement, rule: DonorTierRule, quota: DonorQuota, t: Messages): string {
  const q = t.donorQuota;
  switch (req) {
    case 'accept_terms':
      return q.reqAcceptTerms;
    case 'contact_info':
      return q.reqContactInfo;
    case 'distribution_area':
      return q.reqDistributionArea;
    case 'recipient_groups':
      return q.reqRecipientGroups;
    case 'purpose':
      return q.reqPurpose;
    case 'be_volunteer':
      return q.reqBeVolunteer;
    case 'proof_photos':
      return formatTemplate(q.reqProofPhotos, { n: rule.proofs_required ?? 0, h: quota.proof_deadline_hours });
    case 'org_info':
      return q.reqOrgInfo;
    case 'beneficiary_count':
      return q.reqBeneficiaryCount;
    case 'distribution_mode':
      return q.reqDistributionMode;
    case 'registration_or_community_cert':
      return q.reqCert;
    case 'site_photos':
      return q.reqSitePhotos;
  }
}

function methodText(rule: DonorTierRule, t: Messages): string {
  if (rule.method === 'instant') return t.donorQuota.methodInstant;
  if (rule.method === 'auto') return t.donorQuota.methodAuto;
  return t.donorQuota.methodAdminReview;
}

function basisText(quota: DonorQuota, t: Messages): string | null {
  const { tier, beneficiary_count: count } = quota.me;
  if (tier === null) return null;
  const rule = ruleFor(quota, tier);
  if (rule === undefined) return null;
  if (tier === 'verified_org') {
    return formatTemplate(t.donorQuota.basisOrg, { count: count ?? 0, per: rule.kg_per_beneficiary ?? 0 });
  }
  const template = tier === 'volunteer' ? t.donorQuota.basisVolunteer : t.donorQuota.basisTrusted;
  return formatTemplate(template, { cap: rule.weekly_cap_kg ?? 0 });
}

/** Weekly usage, progress bar and "how it's computed" line for users who hold a tier. */
export function QuotaSummary({ quota }: { quota: DonorQuota }): React.ReactElement | null {
  const { t } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { cap_kg: cap, used_kg: used, remaining_kg: remaining, tier, suspended } = quota.me;
  if (tier === null || cap === null || used === null || remaining === null) return null;
  const ratio = cap > 0 ? Math.min(1, used / cap) : 1;
  const trusted = ruleFor(quota, 'trusted_volunteer');
  const showTrustedProgress =
    tier === 'volunteer' && trusted !== undefined && trusted.proofs_required !== null && !suspended;
  return (
    <View style={styles.block}>
      <View style={styles.headRow}>
        <Text style={styles.weekLine}>
          {formatTemplate(t.donorQuota.weekLine, { cap, used, remaining })}
        </Text>
        <Pressable
          onPress={() => setSheetOpen(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t.donorQuota.infoLabel}
          style={styles.infoBtn}
        >
          <Feather name="info" size={18} color={C.leaf} />
        </Pressable>
      </View>
      <View
        style={styles.barTrack}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: cap, now: Math.min(used, cap) }}
      >
        <View style={[styles.barFill, { width: `${Math.round(ratio * 100)}%` }, ratio >= 1 ? styles.barFull : null]} />
      </View>
      <Text style={styles.muted}>
        {basisText(quota, t)} · {t.donorQuota.resetsMonday}
      </Text>
      {showTrustedProgress ? (
        <Text style={styles.muted}>
          {formatTemplate(t.donorQuota.trustedProgress, {
            done: Math.min(quota.me.trusted_proof_count, trusted.proofs_required ?? 0),
            need: trusted.proofs_required ?? 0,
            cap: trusted.weekly_cap_kg ?? 0,
          })}
        </Text>
      ) : null}
      {suspended ? <Text style={styles.warn}>{t.donorQuota.suspended}</Text> : null}
      <TierSheet quota={quota} visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

/** Bottom sheet listing every tier, its quota and how to qualify. */
export function TierSheet({
  quota,
  visible,
  onClose,
}: {
  quota: DonorQuota;
  visible: boolean;
  onClose: () => void;
}): React.ReactElement {
  const { t } = useI18n();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{t.donorQuota.sheetTitle}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t.donorQuota.close}>
              <Feather name="x" size={22} color={C.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            {quota.tiers.map((rule) => (
              <View key={rule.tier} style={[styles.tierCard, quota.me.tier === rule.tier ? styles.tierCardOn : null]}>
                <View style={styles.headRow}>
                  <Text style={styles.tierName}>{labelDonorTier(rule.tier, t)}</Text>
                  {quota.me.tier === rule.tier ? <Text style={styles.badge}>{t.donorQuota.current}</Text> : null}
                </View>
                <Text style={styles.tierQuota}>{tierQuotaText(rule, t)}</Text>
                <Text style={styles.sectionLabel}>{t.donorQuota.howTo}</Text>
                <Text style={styles.bullet}>· {methodText(rule, t)}</Text>
                {rule.requirements.map((req) => (
                  <Text key={req} style={styles.bullet}>
                    · {requirementText(req, rule, quota, t)}
                  </Text>
                ))}
                <Text style={styles.bullet}>
                  · {rule.can_book_org_only_lots ? t.donorQuota.orgOnlyLotsYes : t.donorQuota.orgOnlyLotsNo}
                </Text>
              </View>
            ))}
            <Text style={styles.muted}>
              {formatTemplate(t.donorQuota.suspendNote, { n: quota.suspend_fail_count, d: quota.suspend_window_days })}
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * "What you get by applying" comparison for the tiers the user can still apply for.
 * Renders nothing when there is no upgrade left (hides CTAs for top-tier users).
 */
export function ApplyCompare({
  quota,
  onApply,
}: {
  quota: DonorQuota;
  /** When set, shows a CTA button (omit where the user is already choosing a kind). */
  onApply?: () => void;
}): React.ReactElement | null {
  const { t } = useI18n();
  const options = quota.me.upgrade_options;
  if (options.length === 0) return null;
  const trusted = ruleFor(quota, 'trusted_volunteer');
  const currentRule = quota.me.tier === null ? undefined : ruleFor(quota, quota.me.tier);
  const hasTier = quota.me.tier !== null;
  const title = hasTier ? t.donorQuota.upgradeTitle : t.donorQuota.compareTitle;
  const cards = options
    .map((tier) => ruleFor(quota, tier))
    .filter((rule): rule is DonorTierRule => rule !== undefined);
  return (
    <View style={styles.compare}>
      <Text style={styles.compareTitle}>{title}</Text>
      {cards.map((rule) => {
        const isOrg = rule.tier === 'verified_org';
        const benefit = isOrg
          ? hasTier
            ? formatTemplate(t.donorQuota.benefitOrgFrom, { cap: currentRule?.weekly_cap_kg ?? 0 })
            : t.donorQuota.benefitOrg
          : t.donorQuota.benefitVolunteer;
        return (
          <View key={rule.tier} style={styles.tierCard}>
            <Text style={styles.tierName}>{isOrg ? t.donorQuota.compareOrg : t.donorQuota.compareVolunteer}</Text>
            <Text style={styles.tierQuota}>{tierQuotaText(rule, t)}</Text>
            <Text style={styles.sectionLabel}>{t.donorQuota.howTo}</Text>
            <Text style={styles.bullet}>· {methodText(rule, t)}</Text>
            {rule.requirements.map((req) => (
              <Text key={req} style={styles.bullet}>
                · {requirementText(req, rule, quota, t)}
              </Text>
            ))}
            <Text style={styles.benefit}>{benefit}</Text>
            {!isOrg && trusted !== undefined && trusted.weekly_cap_kg !== null ? (
              <Text style={styles.muted}>
                {formatTemplate(t.donorQuota.benefitVolunteerTrusted, {
                  n: trusted.proofs_required ?? 0,
                  cap: trusted.weekly_cap_kg,
                })}
              </Text>
            ) : null}
          </View>
        );
      })}
      {onApply !== undefined ? (
        quota.me.tier === null ? (
          <PrimaryButton label={t.donorQuota.ctaApply} block onPress={onApply} />
        ) : (
          <SecondaryButton label={t.donorQuota.ctaUpgrade} block onPress={onApply} />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  weekLine: { flex: 1, color: C.ink, fontSize: 14, fontFamily: fonts.bodySemi },
  infoBtn: { padding: 2 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: C.leafSoft, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: C.leaf },
  barFull: { backgroundColor: C.soonAccent },
  muted: { color: C.mute, fontSize: 13, fontFamily: fonts.body },
  warn: { color: C.danger, fontSize: 13, fontFamily: fonts.bodyMedium },
  backdrop: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 8,
  },
  sheetTitle: { flex: 1, fontSize: 18, color: C.ink, fontFamily: fonts.titleBold },
  sheetBody: { padding: 16, paddingTop: 8, paddingBottom: 32, gap: 12 },
  tierCard: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.card,
    padding: 12,
    gap: 4,
    backgroundColor: C.surface,
  },
  tierCardOn: { borderColor: C.leaf, backgroundColor: C.leafSoft },
  tierName: { flex: 1, fontSize: 15, color: C.ink, fontFamily: fonts.bodySemi },
  tierQuota: { fontSize: 14, color: C.leaf, fontFamily: fonts.bodySemi },
  badge: {
    fontSize: 12,
    color: C.okFg,
    backgroundColor: C.okBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    fontFamily: fonts.bodyMedium,
  },
  sectionLabel: { marginTop: 6, fontSize: 13, color: C.mute, fontFamily: fonts.bodySemi },
  bullet: { color: C.ink, fontSize: 13, lineHeight: 19, fontFamily: fonts.body },
  benefit: { marginTop: 6, color: C.leafDeep, fontSize: 13, fontFamily: fonts.bodySemi },
  compare: { gap: 10 },
  compareTitle: { fontSize: 15, color: C.ink, fontFamily: fonts.bodySemi },
});
