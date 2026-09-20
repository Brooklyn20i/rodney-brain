import SwiftUI

struct NativeLoginView: View {
    @Bindable var model: NativeAppModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 24) {
                Spacer()

                VStack(alignment: .leading, spacing: 8) {
                    Image(systemName: "waveform.path.ecg.rectangle")
                        .font(.system(size: 40, weight: .semibold))
                        .foregroundStyle(.tint)
                    Text("Cadence")
                        .font(.largeTitle.bold())
                    Text("Your human-agent control room.")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 14) {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.next)

                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .submitLabel(.go)
                        .onSubmit(signIn)
                }
                .textFieldStyle(.roundedBorder)

                if let errorMessage = model.errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("login-error")
                }

                Button(action: signIn) {
                    HStack {
                        Spacer()
                        if model.isSigningIn {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Sign in")
                                .fontWeight(.semibold)
                        }
                        Spacer()
                    }
                    .frame(minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.isSigningIn)
                .accessibilityIdentifier("sign-in")

                Text("Cadence uses your user session and workspace permissions. Agent or service-role credentials are never stored in this app.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()
            }
            .padding(24)
            .navigationBarHidden(true)
        }
    }

    private func signIn() {
        Task {
            await model.signIn(email: email, password: password)
        }
    }
}
