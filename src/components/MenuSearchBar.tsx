import styled from "styled-components";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function SearchBar({
  value,
  onChange,
}: SearchBarProps) {
  return (
    <SearchContainer>
      <Input
        type="text"
        placeholder="Type something"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </SearchContainer>
  );
}

const SearchContainer = styled.div`
  width: 100%;
`;

const Input = styled.input`
  width: 100%;
`;