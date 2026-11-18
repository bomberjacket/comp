import { Body, Button, Container, Heading, Html, Link, Preview, Section, Tailwind, Text } from '@react-email/components';
import { Footer } from '../components/footer';
import { Logo } from '../components/logo';

interface Props {
  url: string;
  hours: number;
}

/** One-time link a BNI administrator sends so a person can set a password and an authenticator app. */
export const SetupLinkEmail = ({ url, hours }: Props) => (
  <Html>
    <Tailwind>
      <head />
      <Preview>Set up your sign-in</Preview>
      <Body className="mx-auto my-auto bg-[#fff] font-sans">
        <Container className="mx-auto my-[40px] max-w-[600px] border-[#E8E7E1] p-[20px]" style={{ borderStyle: 'solid', borderWidth: 1 }}>
          <Logo />
          <Heading className="mx-0 my-[30px] p-0 text-center text-[24px] font-normal text-[#121212]">Set up your sign-in</Heading>
          <Text className="text-[14px] leading-[24px] text-[#121212]">
            A BNI administrator has approved your access. Use the button below to set a password and connect an authenticator app
            (Microsoft Authenticator, Google Authenticator or similar). After that you sign in with your password and a code from the app.
          </Text>
          <Section className="mt-[32px] mb-[42px] text-center">
            <Button className="border border-solid border-[#121212] bg-transparent px-6 py-3 text-center text-[14px] font-medium text-[#121212] no-underline" href={url}>
              Set up sign-in
            </Button>
          </Section>
          <Text className="text-[14px] leading-[24px] break-all text-[#707070]">
            or copy and paste this URL into your browser{' '}
            <Link href={url} className="text-[#707070] underline">
              {url}
            </Link>
          </Text>
          <Text className="text-[14px] leading-[24px] text-[#707070]">
            The link works once and expires in {hours} hours. If you did not expect this email, ignore it and tell your BNI administrator.
          </Text>
          <Footer />
        </Container>
      </Body>
    </Tailwind>
  </Html>
);
