package oracle

import (
	"encoding/json"
	"testing"
)

func TestFxpOperations(t *testing.T) {
	tests := []struct{ op, args, want string }{
		{"fxp.parse", `{"input":"1,234.56789"}`, `{"raw":"12345678"}`},
		{"fxp.parse", `{"input":"1e-3"}`, `{"raw":"10"}`},
		{"fxp.format", `{"raw":"-12500"}`, `{"text":"-1.25"}`},
		{"fxp.add", `{"left":"9223372036854775807","right":"1"}`, `{"raw":"-9223372036854775808"}`},
		{"fxp.subtract", `{"left":"-9223372036854775808","right":"1"}`, `{"raw":"9223372036854775807"}`},
		{"fxp.multiply", `{"left":"9223372036854775807","right":"20000"}`, `{"raw":"9223372036854775807"}`},
		{"fxp.divide", `{"left":"-55000","right":"20000"}`, `{"raw":"-27500"}`},
		{"fxp.modulo", `{"left":"-55000","right":"20000"}`, `{"raw":"-15000"}`},
		{"fxp.abs", `{"value":"-12500"}`, `{"raw":"12500"}`},
		{"fxp.truncate", `{"value":"-19999"}`, `{"raw":"-10000"}`},
		{"fxp.floor", `{"value":"-10001"}`, `{"raw":"-20000"}`},
		{"fxp.ceil", `{"value":"10001"}`, `{"raw":"20000"}`},
		{"fxp.round", `{"value":"-15000"}`, `{"raw":"-20000"}`},
		{"fxp.min", `{"left":"1","right":"2"}`, `{"raw":"1"}`},
		{"fxp.max", `{"left":"1","right":"2"}`, `{"raw":"2"}`},
		{"fxp.apply_rounding", `{"value":"-10001","roundDown":true}`, `{"raw":"-20000"}`},
	}

	for _, test := range tests {
		t.Run(test.op+"/"+test.args, func(t *testing.T) {
			got, err := ProcessLine([]byte(`{"id":"fxp","op":"` + test.op + `","args":` + test.args + `}`))
			if err != nil {
				t.Fatal(err)
			}
			var response response
			if err := json.Unmarshal(got, &response); err != nil {
				t.Fatal(err)
			}
			if !response.OK || string(response.Result) != test.want {
				t.Fatalf("unexpected response: %s", got)
			}
		})
	}
}

func TestFxpParseDomainErrors(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{input: " ", want: "invalid_fxp"},
		{input: "out of range", want: "invalid_fxp"},
		{input: "922337203685477.5808", want: "fxp_out_of_range"},
	}

	for _, test := range tests {
		t.Run(test.want, func(t *testing.T) {
			args, err := json.Marshal(map[string]string{"input": test.input})
			if err != nil {
				t.Fatal(err)
			}
			got, err := ProcessLine([]byte(`{"id":"fxp","op":"fxp.parse","args":` + string(args) + `}`))
			if err != nil {
				t.Fatal(err)
			}
			var response response
			if err := json.Unmarshal(got, &response); err != nil {
				t.Fatal(err)
			}
			if response.OK || response.Category != test.want || response.Message == "" {
				t.Fatalf("unexpected response: %s", got)
			}
		})
	}
}

func TestFxpDivideAndModuloByZeroAreDomainErrors(t *testing.T) {
	for _, op := range []string{"fxp.divide", "fxp.modulo"} {
		t.Run(op, func(t *testing.T) {
			got, err := ProcessLine([]byte(`{"id":"fxp","op":"` + op + `","args":{"left":"1","right":"0"}}`))
			if err != nil {
				t.Fatal(err)
			}
			var response response
			if err := json.Unmarshal(got, &response); err != nil {
				t.Fatal(err)
			}
			if response.OK || response.Category != "divide_by_zero" || response.Message == "" {
				t.Fatalf("unexpected response: %s", got)
			}
			if _, err := ProcessLine([]byte(`{"id":"ping","op":"meta.ping","args":{}}`)); err != nil {
				t.Fatalf("process did not survive %s by zero: %v", op, err)
			}
		})
	}
}

func TestFxpMalformedRawAndArgumentShapesAreFatal(t *testing.T) {
	for _, input := range []string{
		`{"id":"fxp","op":"fxp.format","args":{"raw":"not-an-integer"}}`,
		`{"id":"fxp","op":"fxp.add","args":{"left":"1"}}`,
		`{"id":"fxp","op":"fxp.parse","args":{}}`,
		`{"id":"fxp","op":"fxp.apply_rounding","args":{"value":"1","roundDown":"yes"}}`,
		`{"id":"fxp","op":"fxp.apply_rounding","args":{"value":"1"}}`,
	} {
		if _, err := ProcessLine([]byte(input)); err == nil {
			t.Fatalf("expected fatal error for %s", input)
		}
	}
}
