import React from 'react';
import { ActivityIndicator, Animated, Easing, Text, View } from 'react-native';
import { NavigationContainer, DarkTheme, Theme } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createStackNavigator } from '@react-navigation/stack';
import { PlatformPressable } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import {
  RootStackParamList,
  RootTabParamList,
  TimetableStackParamList,
  SubjectsStackParamList,
  RemindersStackParamList,
  HomeStackParamList,
  ProfileStackParamList,
  AuthStackParamList,
} from './types';
import { useAuthStore } from '../store/useAuthStore';
import { isSupabaseConfigured } from '../lib/supabase';
import { FadeSwitch } from '../components/FadeSwitch';
import { WelcomeScreen } from '../screens/Auth/WelcomeScreen';
import { SignInScreen } from '../screens/Auth/SignInScreen';
import { SignUpScreen } from '../screens/Auth/SignUpScreen';
import { OnboardingScreen } from '../screens/Auth/OnboardingScreen';

import { HomeScreen } from '../screens/Home/HomeScreen';
import { StudyBreakdownScreen } from '../screens/Home/StudyBreakdownScreen';
import { StudyCalendarScreen } from '../screens/Home/StudyCalendarScreen';
import { TimetableScreen } from '../screens/Timetable/TimetableScreen';
import { DayScheduleEditor } from '../screens/Timetable/DayScheduleEditor';
import { AIImportPreview } from '../screens/Timetable/AIImportPreview';
import { SubjectsScreen } from '../screens/Subjects/SubjectsScreen';
import { SubjectDetailScreen } from '../screens/Subjects/SubjectDetailScreen';
import { SubjectProfileScreen } from '../screens/Subjects/SubjectProfileScreen';
import { LessonScreen } from '../screens/Subjects/LessonScreen';
import { RemindersScreen } from '../screens/Reminders/RemindersScreen';
import { AddReminderScreen } from '../screens/Reminders/AddReminderScreen';
import { ProfileScreen } from '../screens/Profile/ProfileScreen';
import { StudySessionScreen } from '../screens/Study/StudySessionScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();
const RootStackNav = createNativeStackNavigator<RootStackParamList>();
const HomeStackNav = createStackNavigator<HomeStackParamList>();
const TimetableStackNav = createStackNavigator<TimetableStackParamList>();
const SubjectsStackNav = createStackNavigator<SubjectsStackParamList>();
const RemindersStackNav = createStackNavigator<RemindersStackParamList>();
const ProfileStackNav = createStackNavigator<ProfileStackParamList>();
const AuthStackNav = createStackNavigator<AuthStackParamList>();

// IMPORTANT: `animation` must be set explicitly.
// @react-navigation/stack's `getDefaultAnimation()` falls back to 'none' on web
// (and windows/macos), and when animation is disabled the card's gesture value is
// initialised at its *end* position — so the screen appears instantly with no slide.
// Naming the preset makes the horizontal push deterministic on every platform.
const SLIDE = 'slide_from_right';

// The preset's default is a slow iOS spring (~490ms). A short timing curve keeps
// the push snappy while still reading as a slide.
const pushSpec = {
  animation: 'timing',
  config: { duration: 240, easing: Easing.bezier(0.25, 0.1, 0.25, 1) },
} as const;
const popSpec = {
  animation: 'timing',
  config: { duration: 200, easing: Easing.bezier(0.25, 0.1, 0.25, 1) },
} as const;

/**
 * Horizontal push where the screen being left behind fades out as it parallaxes
 * away, instead of staying fully opaque until it's covered. The two screens blend
 * into one another, which reads as a much smoother slide.
 *
 * `progress` runs 0→1 while this card is the one arriving, and 1→2 once another
 * card is pushed on top of it — so the 1→2 leg is the "leaving" half.
 */
const forHorizontalFade = ({ current, next, inverted, layouts: { screen } }: any) => {
  const progress = Animated.add(
    current.progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    next ? next.progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) : 0
  );
  return {
    cardStyle: {
      transform: [
        {
          translateX: Animated.multiply(
            progress.interpolate({
              inputRange: [0, 1, 2],
              outputRange: [screen.width, 0, screen.width * -0.28],
              extrapolate: 'clamp',
            }),
            inverted
          ),
        },
      ],
      opacity: progress.interpolate({
        inputRange: [0, 1, 2],
        outputRange: [1, 1, 0],
        extrapolate: 'clamp',
      }),
    },
  };
};

// Opaque horizontal slide (standard iOS push). `cardStyle` forces an opaque
// background so the outgoing screen can never show through the incoming one.
function useSlideScreenOptions() {
  const t = useBaseTheme();
  return React.useMemo(
    () =>
      ({
        headerShown: false,
        animation: SLIDE,
        gestureEnabled: true,
        gestureDirection: 'horizontal',
        detachPreviousScreen: true,
        cardOverlayEnabled: false,
        cardStyle: { backgroundColor: t.base },
        cardStyleInterpolator: forHorizontalFade,
        transitionSpec: { open: pushSpec, close: popSpec },
      }) as const,
    [t.base]
  );
}

// Vertical slide-up for modal-style screens.
const modalOptions = {
  presentation: 'modal',
  animation: 'slide_from_bottom',
  gestureEnabled: true,
  gestureDirection: 'vertical',
  cardOverlayEnabled: true,
} as const;

function HomeStack() {
  const slideScreenOptions = useSlideScreenOptions();
  return (
    <HomeStackNav.Navigator screenOptions={slideScreenOptions}>
      <HomeStackNav.Screen name="HomeHome" component={HomeScreen} />
      <HomeStackNav.Screen name="StudyBreakdown" component={StudyBreakdownScreen} />
      <HomeStackNav.Screen name="StudyCalendar" component={StudyCalendarScreen} />
    </HomeStackNav.Navigator>
  );
}

function TimetableStack() {
  const slideScreenOptions = useSlideScreenOptions();
  return (
    <TimetableStackNav.Navigator screenOptions={slideScreenOptions}>
      <TimetableStackNav.Screen name="TimetableHome" component={TimetableScreen} />
      <TimetableStackNav.Screen name="DayScheduleEditor" component={DayScheduleEditor} />
      <TimetableStackNav.Screen name="AIImportPreview" component={AIImportPreview} options={modalOptions} />
      {/* Same editor as the reminders tab, pushed here so `goBack` returns to
          the day you tapped the reminder on. */}
      <TimetableStackNav.Screen name="AddReminder" component={AddReminderScreen} />
    </TimetableStackNav.Navigator>
  );
}

function SubjectsStack() {
  const slideScreenOptions = useSlideScreenOptions();
  return (
    <SubjectsStackNav.Navigator screenOptions={slideScreenOptions}>
      <SubjectsStackNav.Screen name="SubjectsHome" component={SubjectsScreen} />
      <SubjectsStackNav.Screen name="SubjectDetail" component={SubjectDetailScreen} />
      <SubjectsStackNav.Screen name="SubjectProfile" component={SubjectProfileScreen} />
      <SubjectsStackNav.Screen name="Lesson" component={LessonScreen} />
    </SubjectsStackNav.Navigator>
  );
}

function RemindersStack() {
  const slideScreenOptions = useSlideScreenOptions();
  return (
    <RemindersStackNav.Navigator screenOptions={slideScreenOptions}>
      <RemindersStackNav.Screen name="RemindersHome" component={RemindersScreen} />
      {/* A normal push (horizontal slide) so saving slides back to the list. */}
      <RemindersStackNav.Screen name="AddReminder" component={AddReminderScreen} />
    </RemindersStackNav.Navigator>
  );
}

function ProfileStack() {
  const slideScreenOptions = useSlideScreenOptions();
  return (
    <ProfileStackNav.Navigator screenOptions={slideScreenOptions}>
      <ProfileStackNav.Screen name="ProfileHome" component={ProfileScreen} />
    </ProfileStackNav.Navigator>
  );
}

const TAB_ICONS: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  HomeTab: 'home',
  TimetableTab: 'calendar',
  SubjectsTab: 'layers',
  RemindersTab: 'notifications',
  ProfileTab: 'person',
};

const TAB_ICONS_OUTLINE: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  HomeTab: 'home-outline',
  TimetableTab: 'calendar-outline',
  SubjectsTab: 'layers-outline',
  RemindersTab: 'notifications-outline',
  ProfileTab: 'person-outline',
};

function TabBarButton(props: BottomTabBarButtonProps) {
  return <PlatformPressable {...props} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} />;
}

const TAB_LABELS: Record<keyof RootTabParamList, string> = {
  HomeTab: 'Home',
  TimetableTab: 'Timetable',
  SubjectsTab: 'Subjects',
  RemindersTab: 'Reminders',
  ProfileTab: 'Profile',
};

function MainTabs() {
  const t = useBaseTheme();
  return (
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          // Subtle slide + cross-fade + scale between tabs; the tab bar itself stays fixed.
          animation: 'shift',
          transitionSpec: {
            animation: 'timing',
            config: { duration: 300, easing: Easing.bezier(0.4, 0, 0.2, 1) },
          },
          // Smooth linear cross-fade + small slide. No scale — scaling a scene
          // leaves an uncovered strip at the edges during the transition.
          sceneStyleInterpolator: ({ current }) => ({
            sceneStyle: {
              opacity: current.progress.interpolate({
                inputRange: [-1, 0, 1],
                outputRange: [0, 1, 0],
              }),
              transform: [
                {
                  translateX: current.progress.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: [-24, 0, 24],
                  }),
                },
              ],
            },
          }),
          tabBarActiveTintColor: t.accentLight,
          tabBarInactiveTintColor: t.muted,
          tabBarStyle: {
            backgroundColor: t.base,
            borderTopColor: t.isLight ? '#E2E2E8' : colors.border,
            borderTopWidth: 1,
            height: 88,
            paddingTop: 8,
            paddingBottom: 28,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
          tabBarButton: TabBarButton,
          tabBarLabel: TAB_LABELS[route.name],
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? TAB_ICONS[route.name] : TAB_ICONS_OUTLINE[route.name]}
              size={size ?? 24}
              color={color}
            />
          ),
        })}
      >
        <Tab.Screen name="HomeTab" component={HomeStack} />
        <Tab.Screen name="TimetableTab" component={TimetableStack} />
        <Tab.Screen name="SubjectsTab" component={SubjectsStack} />
        <Tab.Screen name="RemindersTab" component={RemindersStack} />
        <Tab.Screen name="ProfileTab" component={ProfileStack} />
      </Tab.Navigator>
  );
}

function AuthStack() {
  const slideScreenOptions = useSlideScreenOptions();
  return (
    <AuthStackNav.Navigator screenOptions={slideScreenOptions}>
      <AuthStackNav.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStackNav.Screen name="SignIn" component={SignInScreen} />
      <AuthStackNav.Screen name="SignUp" component={SignUpScreen} />
    </AuthStackNav.Navigator>
  );
}

/** Shown while a stored session is being restored, so the app never flashes. */
function AuthLoading() {
  const t = useBaseTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.base }}>
      <ActivityIndicator color={t.accentLight} />
    </View>
  );
}

/** Shown when the Supabase keys haven't been filled in yet. */
function SupabaseSetupNotice() {
  const t = useBaseTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: t.base }}>
      <Text style={{ color: t.text, fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' }}>
        Accounts aren't configured yet
      </Text>
      <Text style={{ color: t.secondary, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
        Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env, then restart the
        bundler.
      </Text>
    </View>
  );
}

export function RootNavigator() {
  const t = useBaseTheme();
  const status = useAuthStore((s) => s.status);
  const init = useAuthStore((s) => s.init);

  React.useEffect(() => {
    init();
  }, [init]);

  const navTheme: Theme = React.useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: t.base,
        card: t.base,
        border: t.isLight ? '#E2E2E8' : colors.border,
        primary: t.accent,
        text: t.text,
      },
    }),
    [t.base, t.isLight, t.accent, t.text]
  );
  // One NavigationContainer, three possible worlds: the auth flow, the
  // registration questions, or the app itself. Swapping the tree on `status`
  // means signing out can never leave an app screen behind it.
  // FadeSwitch dissolves between these trees — signing in would otherwise cut
  // straight from the auth flow to the tab bar with no transition at all.
  return (
    <NavigationContainer theme={navTheme}>
      <View style={{ flex: 1, backgroundColor: t.base }}>
        <FadeSwitch switchKey={isSupabaseConfigured ? status : 'unconfigured'}>
          {!isSupabaseConfigured ? (
            <SupabaseSetupNotice />
          ) : status === 'loading' ? (
            <AuthLoading />
          ) : status === 'signedOut' ? (
            <AuthStack />
          ) : status === 'onboarding' ? (
            <OnboardingScreen />
          ) : (
            <RootStackNav.Navigator screenOptions={{ headerShown: false }}>
              <RootStackNav.Screen name="Tabs" component={MainTabs} />
              <RootStackNav.Screen
                name="StudySession"
                component={StudySessionScreen}
                options={{ presentation: 'transparentModal', gestureEnabled: false, animation: 'fade' }}
              />
            </RootStackNav.Navigator>
          )}
        </FadeSwitch>
      </View>
    </NavigationContainer>
  );
}
