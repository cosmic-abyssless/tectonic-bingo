import { SignupForm } from "../../../core/signup/SignupForm";

export function SignupStage({ slug }: { slug: string }) {
  return <SignupForm slug={slug} />;
}
