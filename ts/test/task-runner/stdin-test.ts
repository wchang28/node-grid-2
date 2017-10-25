// a test process that takes all the input from stdin
let input = "";
process.stdin.on("end", () => {
    console.log("input=" + input);
    console.error("everything is OK. just testing stderr");
    process.exit(0);
}).on("data", (s: string) => {
    input += s;
});