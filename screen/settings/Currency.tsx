import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, Text, TextInput, UIManager, View } from 'react-native';

import { getPreferredCurrency, initCurrencyDaemon, setPreferredCurrency } from '../../modules/currency';
import presentAlert from '../../components/Alert';
import Row from '../../components/SettingsRow';
import SearchIcon from '../../components/icons/SearchIcon';
import CheckmarkIcon from '../../components/icons/CheckmarkIcon';
import { useTheme } from '../../components/themes';
import loc from '../../loc';
import { FiatUnit, FiatUnitType, getFiatRate } from '../../models/fiatUnit';
import { useSettings } from '../../hooks/context/useSettings';
import SafeAreaFlatList from '../../components/SafeAreaFlatList';
import { ClashFont } from '../../constants/fonts';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ITEM_HEIGHT = 88;

const currencyShortName = (item: FiatUnitType) => item.country.match(/\(([^)]+)\)/)?.[1] ?? item.country;

const Currency: React.FC = () => {
  const { setPreferredFiatCurrencyStorage } = useSettings();
  const [isSavingNewPreferredCurrency, setIsSavingNewPreferredCurrency] = useState<FiatUnitType | undefined>();
  const [selectedCurrency, setSelectedCurrency] = useState<FiatUnitType>(FiatUnit.USD);
  const { colors } = useTheme();
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    if (search.length > 0) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }

    const searchLower = search.toLowerCase();
    return Object.values(FiatUnit).filter(
      item => item.endPointKey.toLowerCase().includes(searchLower) || item.country.toLowerCase().includes(searchLower),
    );
  }, [search]);

  const fetchCurrency = useCallback(async () => {
    try {
      const preferredCurrency = await getPreferredCurrency();
      if (preferredCurrency === null) {
        throw Error();
      }
      setSelectedCurrency(preferredCurrency);
    } catch (_error) {
      setSelectedCurrency(FiatUnit.USD);
    }
  }, []);

  useEffect(() => {
    fetchCurrency();
  }, [fetchCurrency]);

  const getItemLayout = useCallback(
    (_data: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    [],
  );

  const renderItem = useCallback(
    // eslint-disable-next-line react/no-unused-prop-types
    ({ item }: { item: FiatUnitType }) => {
      const isSelected = selectedCurrency.endPointKey === item.endPointKey;
      const isDisabled = isSavingNewPreferredCurrency === item || isSelected;

      return (
        <Row
          disabled={isDisabled}
          roundIcon
          icon={
            <Text
              style={[styles.symbol, { color: colors.settingsRowTitle }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {item.symbol}
            </Text>
          }
          title={item.endPointKey}
          subtitle={currencyShortName(item)}
          rightElement={isSelected ? <CheckmarkIcon color={colors.successCheck} size={20} /> : null}
          onPress={async () => {
            if (isDisabled) return;

            setIsSavingNewPreferredCurrency(item);
            try {
              await getFiatRate(item.endPointKey);
              await setPreferredCurrency(item);
              await initCurrencyDaemon(true);
              await fetchCurrency();
              setSelectedCurrency(item);
              setPreferredFiatCurrencyStorage(FiatUnit[item.endPointKey]);
            } catch (error: any) {
              console.log(error);
              presentAlert({
                message: error.message ? `${loc.settings.currency_fetch_error}: ${error.message}` : loc.settings.currency_fetch_error,
              });
            } finally {
              setIsSavingNewPreferredCurrency(undefined);
            }
          }}
        />
      );
    },
    [isSavingNewPreferredCurrency, selectedCurrency, colors.settingsRowTitle, fetchCurrency, setPreferredFiatCurrencyStorage],
  );

  const keyExtractor = useCallback((item: FiatUnitType) => `${item.endPointKey}-${item.locale}`, []);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.searchBar, { backgroundColor: colors.background, borderColor: colors.settingsCardBorder }]}>
        <SearchIcon background="transparent" stroke={colors.alternativeTextColor} />
        <TextInput
          style={[styles.searchInput, { color: colors.settingsRowTitle }]}
          placeholder={loc.settings.search_currency}
          placeholderTextColor={colors.placeholderTextColor}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </View>
      <View style={[styles.listCard, { backgroundColor: colors.settingsCardBackground }]}>
        <SafeAreaFlatList
          style={styles.transparent}
          keyExtractor={keyExtractor}
          data={data}
          extraData={selectedCurrency}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={true}
          getItemLayout={getItemLayout}
          renderItem={renderItem}
        />
      </View>
    </View>
  );
};

export default Currency;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 18,
    marginTop: 16,
    paddingLeft: 4,
    paddingRight: 16,
    height: 49,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 4,
    fontSize: 16,
    fontFamily: ClashFont.regular,
  },
  listCard: {
    flex: 1,
    marginHorizontal: 18,
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  transparent: {
    backgroundColor: 'transparent',
  },
  symbol: {
    fontSize: 16,
    fontFamily: ClashFont.medium,
    maxWidth: 36,
    textAlign: 'center',
  },
});
