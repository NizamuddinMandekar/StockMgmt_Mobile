import { Image, StyleSheet, View } from 'react-native';

import { colors } from '../theme';

export default function LogoMark({ size = 38, imageSize = 26, radius: r = 10 }) {
  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderRadius: r, backgroundColor: colors.ink },
      ]}
    >
      <Image
        source={require('../../assets/logo-white.png')}
        style={{ width: imageSize, height: imageSize }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
